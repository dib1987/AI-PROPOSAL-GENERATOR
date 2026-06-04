/**
 * One-time OAuth2 setup script. Prints the Gmail refresh token to stdout.
 * Run: npx ts-node src/scripts/get-gmail-token.ts
 *
 * Prerequisites:
 *   1. Create an OAuth2 credential in Google Cloud Console (type: Desktop app).
 *   2. Add your Gmail address as a test user under OAuth consent screen.
 *   3. Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in .env (or inline below).
 *   4. Run this script, open the printed URL in a browser, authorise, paste the code back.
 *   5. Copy the printed refresh token into .env as GMAIL_OAUTH_REFRESH_TOKEN.
 */
import * as dotenv from "dotenv";
dotenv.config();

import * as readline from "node:readline";
import { google } from "googleapis";

const CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "Missing env vars: GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET must be set in .env"
  );
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/drive.file",
];

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob" // out-of-band redirect — prints the code to the browser
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent", // force consent screen so refresh token is always returned
});

console.log("\n=== Gmail OAuth2 Token Setup ===\n");
console.log("1. Open this URL in your browser:\n");
console.log(`   ${authUrl}\n`);
console.log("2. Sign in with the Gmail account that will be polled.");
console.log("3. Authorise the permissions.");
console.log("4. Copy the authorisation code shown in the browser.\n");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Paste the authorisation code here: ", async (code) => {
  rl.close();

  try {
    const { tokens } = await oauth2Client.getToken(code.trim());

    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh token returned. This usually means the account already authorised this app.\n" +
          "Fix: Go to https://myaccount.google.com/permissions, revoke access for this app, then re-run this script."
      );
      process.exit(1);
    }

    console.log("\n=== Success ===\n");
    console.log("Add this to your .env file:\n");
    console.log(`GMAIL_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log(
      "For Trigger.dev cloud deployment, add GMAIL_OAUTH_REFRESH_TOKEN via the Trigger.dev dashboard environment variables."
    );
  } catch (err) {
    console.error("\nFailed to exchange code for tokens:", (err as Error).message);
    process.exit(1);
  }
});
