import db from "@/app/api/Database";
import Account, {
	AccountEmailVerification,
	AccountPermission
} from "./Account";
import postgres from "postgres";
import * as crypto from "crypto";
import { WalletTransaction, WalletTransactionStatus } from "./Wallet";

export default class AccountServe {
	public static async getBalance(accountEmail: string): Promise<number> {
		const summedTransactions =
			((
				await db`SELECT SUM(AmountInCents) FROM WalletTransaction WHERE AccountEmail=${accountEmail} AND Status=${WalletTransactionStatus.Paid}`
			)[0].sum as number) ?? 0;

		const summedRequests =
			((
				await db`SELECT SUM(TotalPriceInCents) FROM Request WHERE OwnerEmail=${accountEmail} AND PaidAt IS NOT NULL`
			)[0].sum as number) ?? 0;

		const accountBalanceInCents = summedTransactions - summedRequests;
		return accountBalanceInCents;
	}

	public static async queryByEmail(
		email: string
	): Promise<Account | undefined> {
		const query = await db`SELECT * FROM account WHERE email=${email}`;
		if (query.length == 0) return undefined;

		const accountRow = query.at(0)!;
		return {
			email,
			firstName: accountRow.firstname,
			lastName: accountRow.lastname,
			isEmailVerified: accountRow.isemailverified,
			permission: accountRow.permission as AccountPermission,
			balanceInDollars: (await AccountServe.getBalance(email)) / 100,
			joinedAt: accountRow.joinedat,
			isTwoStepAuthVerified: accountRow.istwostepauthverified
		};
	}

	public static async queryEmailVerification(
		token: string
	): Promise<AccountEmailVerification | undefined> {
		const query =
			await db`SELECT * FROM accountverificationcode WHERE code=${token}`;
		if (query.length == 0) return undefined;

		const emailVerificationRow = query.at(0)!;
		return {
			accountEmail: emailVerificationRow.accountemail,
			createdAt: emailVerificationRow.createdat,
			code: emailVerificationRow.code
		};
	}

	public static async recreateVerificationCode(
		accountEmail: string,
		dbContext?: postgres.Sql<{}>
	): Promise<AccountEmailVerification> {
		dbContext = dbContext ?? db;

		return await dbContext.begin(async (dbTransaction) => {
			await dbTransaction`DELETE FROM accountverificationcode WHERE accountemail=${accountEmail}`;

			const verificationCode = crypto.randomBytes(16).toString("hex");
			const insertedRow =
				await dbTransaction`INSERT INTO accountverificationcode (accountemail, code) VALUES (${accountEmail}, ${verificationCode}) returning createdat`;

			console.log(insertedRow.at(0));

			return {
				accountEmail,
				code: verificationCode,
				createdAt: insertedRow.at(0)!.createdat
			} as AccountEmailVerification;
		});
	}

	public static async queryPendingTransaction(
		accountEmail: string,
		dbContext?: postgres.Sql<{}>
	): Promise<WalletTransaction | undefined> {
		dbContext = dbContext ?? db;

		const transactionQuery =
			await dbContext`SELECT * FROM WalletTransaction WHERE AccountEmail=${accountEmail} AND Status=${WalletTransactionStatus.Pending}`;
		const transactionRow = transactionQuery.at(0);

		return transactionRow == undefined
			? undefined
			: {
					id: transactionRow!.id,
					accountEmail: accountEmail,
					amountInCents: transactionRow!.amountincents,
					feesInCents: transactionRow!.feesincents,
					taxInCents: transactionRow!.taxincents,
					paidAt: transactionRow!.paidat,
					paymentStatus: transactionRow!.status,
					paymentMethod: transactionRow!.paymentmethod,
					stripeCheckoutId: transactionRow!.stripecheckoutid
			  };
	}

	public static async queryTransaction(
		transactionId: string,
		dbContext?: postgres.Sql<{}>
	): Promise<WalletTransaction | undefined> {
		dbContext = dbContext ?? db;

		const transactionQuery =
			await dbContext`SELECT * FROM WalletTransaction WHERE Id=${transactionId}`;
		const transactionRow = transactionQuery.at(0);

		return transactionRow == undefined
			? undefined
			: {
					id: transactionRow!.id,
					accountEmail: transactionRow!.accountemail,
					amountInCents: transactionRow!.amountincents,
					feesInCents: transactionRow!.feesincents,
					taxInCents: transactionRow!.taxincents,
					paidAt: transactionRow!.paidat,
					paymentStatus: transactionRow!.status,
					paymentMethod: transactionRow!.paymentmethod,
					stripeCheckoutId: transactionRow!.stripecheckoutid
			  };
	}

	public static async queryTransactionsFor(
		accountEmail: string,
		dbContext?: postgres.Sql<{}>
	): Promise<WalletTransaction[]> {
		dbContext = dbContext ?? db;

		return (
			await dbContext`SELECT  * FROM WalletTransaction WHERE AccountEmail=${accountEmail} ORDER BY PaidAt DESC`
		).map<WalletTransaction>((row) => {
			return {
				id: row.id,
				accountEmail: row.accountemail,
				amountInCents: row.amountincents,
				feesInCents: row.feesincents,
				taxInCents: row.taxincents,
				paymentStatus: row.status,
				paidAt: row.paidat,
				paymentMethod: row.paymentmethod,
				stripeCheckoutId: row.stripecheckoutid
			};
		});
	}

	public static async deleteTransaction(
		transactionId: string,
		dbContext?: postgres.Sql<{}>
	): Promise<void> {
		dbContext = dbContext ?? db;

		await dbContext`DELETE FROM WalletTransaction WHERE Id=${transactionId}`;
	}

	public static async insertTransaction(
		transaction: Omit<WalletTransaction, "id">,
		dbContext?: postgres.Sql<{}>
	): Promise<string> {
		dbContext = dbContext ?? db;

		console.log(transaction);

		const insertQuery = await dbContext`INSERT INTO WalletTransaction ${db({
			accountemail: transaction.accountEmail,
			amountincents: transaction.amountInCents,
			taxincents: transaction.taxInCents,
			feesincents: transaction.feesInCents,
			paymentmethod: transaction.paymentMethod,
			stripecheckoutid: transaction.stripeCheckoutId,
			status: transaction.paymentStatus,
			paidat:
				transaction.paymentStatus == WalletTransactionStatus.Paid
					? Date.now()
					: null
		})} 
			RETURNING Id`;

		return insertQuery.at(0)!.id as string;
	}

	public static async markTransactionComplete(
		stripeCheckoutId: string,
		dbContext?: postgres.Sql<{}>
	): Promise<boolean> {
		dbContext = dbContext ?? db;

		const updateQuery =
			await dbContext`UPDATE WalletTransaction SET Status=${WalletTransactionStatus.Paid}, PaidAt=NOW() WHERE StripeCheckoutID=${stripeCheckoutId}`;

		return updateQuery.length > 0;
	}
	public static async markTransactionCancelled(
		stripeCheckoutId: string,
		dbContext?: postgres.Sql<{}>
	): Promise<boolean> {
		dbContext = dbContext ?? db;

		const updateQuery =
			await dbContext`UPDATE WalletTransaction SET Status=${WalletTransactionStatus.Cancelled}, PaidAt=NOW() WHERE StripeCheckoutID=${stripeCheckoutId}`;

		return updateQuery.length > 0;
	}
}