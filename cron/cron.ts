import { config as env_config } from "dotenv";
import { readFileSync, rmSync } from "fs";
import cron from "node-cron";
import postgres from "postgres";

console.log("Hello, from AMS-CRON!");

env_config();

const databaseConnectionString = useEnvVariable("DB_CONNECTION");
const slicerApiUrl = useEnvVariable("SLICER_API_URL");
const modelUploadPath = useEnvVariable("MODEL_UPLOAD_DIR");
// The amount of days a models data should persist until purged.
const modelLifespan = parseInt(useEnvVariable("MODEL_LIFESPAN"));

// The baseline slicer profile used as a generic comparison reference for all models.
// These must match profiles available in the orca-slicer-api instance.
const slicerPrinter = process.env.SLICER_PRINTER ?? "Bambu Lab X1 Carbon 0.4 nozzle";
const slicerFilament = process.env.SLICER_FILAMENT ?? "Bambu PLA Basic @BBL X1C";
const slicerPreset = process.env.SLICER_PRESET ?? "0.20mm Standard @BBL X1C";

console.log(`Configuration:\nMODEL_UPLOAD_DIR: ${modelUploadPath}\nModel Lifespan: ${modelLifespan} (days)\nSlicerAPI: ${slicerApiUrl}\nSlicer Profile: ${slicerPrinter} / ${slicerFilament} / ${slicerPreset}`);

// We CANNOT use the built-in camelCase transformations because our schema keys are not in snake_case! (Unfortunate)
const sql = postgres(databaseConnectionString, { transform: postgres.camel });

interface SliceAsyncInitResponse {
	requestId: string;
	status: string;
	statusUrl: string;
}

interface SliceAsyncPollResponse {
	status: "pending" | "processing" | "completed" | "failed";
	metadata?: {
		printTime: number;
		filamentUsedG: number;
		filamentUsedMm: number;
	};
	message?: string;
}

// Guards against overlapping runs: a slice + poll can take minutes, but the task is scheduled every
// 30s. Since no ModelAnalysis row exists until completion, overlapping runs would re-select and
// re-slice the same model. Skip a tick while a previous run is still in progress.
let analysisInProgress = false;

const analyzeModelsTask = cron.schedule("*/30 * * * * *", async () => {

	if (analysisInProgress) return;
	analysisInProgress = true;

	try
	{

	const unAnalyzedModel = await queryUnAnalyzedModel();

	if (unAnalyzedModel == null)
	{
		// We are caught up with all pending models!
		return;
	}

	let previousError: any;

	for (let attempt = 1; attempt <= 4; attempt++)
	{
		try
		{
			const ownerEmailWithoutDomain = getEmailUsername(unAnalyzedModel.owneremail);

			let modelFile: Buffer;
			try
			{
				modelFile = readFileSync(`${modelUploadPath}/${ownerEmailWithoutDomain}/${unAnalyzedModel.id}.stl`);
			}
			catch (err)
			{
				console.error(err);
				throw new Error("Issue occurred during Model Download");
			}

			// We have downloaded the STL, send it off to the slicer API to process and return the metadata!

			// TODO: This will be changed in the future as different technologies (such as FDM, SLS) will be added as an option for individual parts.
			// We use a fixed Bambu Lab X1C + PLA baseline profile as a generic comparison reference.
			const form = new FormData();
			form.append("file", new Blob([new Uint8Array(modelFile)], { type: "model/stl" }), `${unAnalyzedModel.id}.stl`);
			form.append("printer", slicerPrinter);
			form.append("filament", slicerFilament);
			form.append("preset", slicerPreset);
			form.append("exportType", "3mf");

			let initRes: SliceAsyncInitResponse;
			try
			{
				const initResponse = await fetch(`${slicerApiUrl}/slice-async`, {
					method: "POST",
					body: form,
					cache: "no-cache"
				});
				if (!initResponse.ok)
				{
					const text = await initResponse.text();
					throw new Error(`Slicer API rejected submission (${initResponse.status}): ${text}`);
				}
				initRes = await initResponse.json() as SliceAsyncInitResponse;
			}
			catch (err)
			{
				console.error(err);
				throw new Error("Issue occurred during Slice Submission");
			}

			// Poll until completed or failed (max ~5 minutes: 150 x 2s)
			const MAX_POLL_ATTEMPTS = 150;
			const POLL_INTERVAL_MS = 2000;
			let pollResult: SliceAsyncPollResponse | null = null;

			for (let poll = 0; poll < MAX_POLL_ATTEMPTS; poll++)
			{
				await wait(POLL_INTERVAL_MS);
				const pollResponse = await fetch(`${slicerApiUrl}/slice-async/${initRes.requestId}`, { cache: "no-cache" });
				if (!pollResponse.ok) throw new Error(`Slicer API poll error (${pollResponse.status})`);
				pollResult = await pollResponse.json() as SliceAsyncPollResponse;
				if (pollResult.status === "completed" || pollResult.status === "failed") break;
			}

			// Always clean up the job
			try
			{
				await fetch(`${slicerApiUrl}/slice-async/${initRes.requestId}`, { method: "DELETE", cache: "no-cache" });
			}
			catch (cleanupErr)
			{
				console.warn(`Failed to clean up slice job ${initRes.requestId}:`, cleanupErr);
			}

			if (pollResult == null || pollResult.status !== "completed" || pollResult.metadata == null)
			{
				throw new Error(
					pollResult?.status === "failed"
						? (pollResult.message ?? "Slicer API reported failure for this model")
						: "Slicer API timed out - model was not sliced within 5 minutes"
				);
			}

			const weightInGrams = pollResult.metadata.filamentUsedG;
			const duration = `${pollResult.metadata.printTime} seconds`;

			// Slicer gave us back a valid result, upload the model analysis to our database.
			await sql`INSERT INTO ModelAnalysis (ModelId, EstimatedFilamentUsedInGrams, EstimatedDuration, MachineModel, MachineManufacturer) VALUES (${unAnalyzedModel.id}, ${weightInGrams}, ${duration}, 'X1C', 'BBL')`;

			console.log(`Model analysis on ${unAnalyzedModel.name} completed!`);
			return;
		}
		catch (err)
		{
			console.error(`An issue occurred analyzing model on attempt #${attempt}: ${unAnalyzedModel.name}\n${err}`);
			previousError = err;

			// Wait a few seconds, error may have been caused by connection issues, give it time to fix itself.
			await wait(5000);
		}
	}

	const errorContent = (previousError as Error)?.message ?? "Unknown";

	console.error(`Model analysis on ${unAnalyzedModel.name} has failed too many times:\n${errorContent}`);

	// We had no luck analyzing the model, we will mark it as a fail!
	await sql`INSERT INTO ModelAnalysis (ModelId, FailedReason, MachineModel, MachineManufacturer) VALUES (${unAnalyzedModel.id}, ${errorContent}, 'X1C', 'BBL')`;

	}
	finally
	{
		analysisInProgress = false;
	}
});

// Run at midnight every day.
const deletePurgedTask = cron.schedule("* * * * *", async () => {

	try
	{
		const modelsPendingPurge = await queryModelsPendingPurge();

		for (let model of modelsPendingPurge)
		{
			try
			{
				const emailUsername = getEmailUsername(model.owneremail);

				await sql.begin(async trans =>
				{
					await trans`UPDATE Model SET IsPurged=true WHERE Id=${model.id}`;

					rmSync(`${modelUploadPath}/${emailUsername}/${model.id}.stl`, { force: true });
				});

				console.log(`Successfully purged: ${model.name}`);
			}
			catch (err)
			{
				console.error(`Failed to purge model: \"${model.name}\" Skipping...\n${err}`);
			}
		}
	}
	catch (err)
	{
		console.error(err);
	}
});

async function queryModelsPendingPurge()
{
	return await sql`SELECT m.Id, m.Name, m.OwnerEmail FROM Model m WHERE NOW() > m.UploadedAt + ${modelLifespan + ' days'}::interval LIMIT 100`;
}

async function queryUnAnalyzedModel()
{
	return (await sql`SELECT
						m.OwnerEmail,
						m.Id,
						m.Name
					FROM Model m
					LEFT JOIN ModelAnalysis ma ON m.Id = ma.ModelId
					LEFT JOIN Part p ON m.Id = p.ModelId
					WHERE m.IsPurged = false
						AND ma.ModelId IS NULL
						AND p.Quantity IS NOT NULL
					ORDER BY p.Id
					LIMIT 1;
					`)[0];
}

function useEnvVariable(name: string): string
{
	const variableValue = process.env[name];
	if (variableValue == null)
	{
		throw new Error(`${name} must be provided!`);
	}
	return variableValue;
}

function getEmailUsername(emailAddress: string)
{
	return emailAddress.split("@")[0];
}

function wait(ms: number)
{
	return new Promise(resolve => setTimeout(resolve, ms))
}
