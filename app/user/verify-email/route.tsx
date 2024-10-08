"use server";

import AccountServe from "@/app/Types/Account/AccountServe";
import { getJwtPayload } from "@/app/api/util/JwtHelper";
import db from "@/app/api/Database";
import { NextRequest, NextResponse } from "next/server";
import assert from "assert";
import { IsVerificationCodeExpired } from "@/app/Types/Account/Account";
import { login } from "@/app/api/util/AccountHelper";
import getConfig from "@/app/getConfig";

const envConfig = getConfig();

export async function GET(request: NextRequest) {
	const verificationToken = request.nextUrl.searchParams.get("token");
	if (verificationToken == undefined)
		return NextResponse.redirect(envConfig.hostURL);

	// Query user data!
	// JWT cannot be null due to middleware preventing non-logged users access.
	const JWT = (await getJwtPayload())!;

	// Validate verification token.
	const verificationEntry = await AccountServe.queryEmailVerification(
		verificationToken
	);
	if (verificationEntry == undefined) {
		if (!JWT.isemailverified) {
			// Email is not verified but doesn't have a verification entry!
			return NextResponse.redirect(
				envConfig.joinHostURL("/user/not-verified")
			);
		}
		return NextResponse.redirect(envConfig.joinHostURL("/not-found"));
	}
	if (JWT.email != verificationEntry?.accountEmail) {
		// Someone is attempting to use someone elses verification token!
		console.error(
			"Verification code should not be used!",
			JWT.email,
			verificationEntry
		);
		return NextResponse.redirect(envConfig.joinHostURL("/not-found"));
	} else if (IsVerificationCodeExpired(verificationEntry)) {
		// TODO: Send to awaiting verification page!
		console.error("Code is expired!");
		return NextResponse.redirect(
			envConfig.joinHostURL("/user/not-verified")
		);
	}

	const linkedAccount = await AccountServe.queryByEmail(JWT.email)!;
	if (linkedAccount == undefined) return;
	if (linkedAccount.isEmailVerified) {
		console.log("Verification has already been done!");
		return NextResponse.redirect(envConfig.joinHostURL("/not-found"));
	}

	await db.begin(async (db) => {
		await db`UPDATE account SET isemailverified=true WHERE email=${JWT.email}`;
		await db`DELETE FROM accountverificationcode WHERE accountemail=${JWT.email}`;
	});

	await login(
		linkedAccount.email,
		linkedAccount.permission,
		linkedAccount.firstName,
		linkedAccount.lastName,
		true
	);

	return NextResponse.redirect(envConfig.joinHostURL("/user/email-verified"));
}
