/**
 * Tests drive-uploader.ts in isolation. Uploads a small test file to Google Drive.
 * Run: npx ts-node src/scripts/test-drive.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "node:fs";
import * as path from "node:path";
import { uploadToDrive } from "../trigger/lib/drive-uploader";

async function main() {
  console.log("Testing drive-uploader...\n");

  // Use local test docx if it exists from test-docx.ts run, otherwise create a dummy buffer
  const localDocx = path.join(process.cwd(), "test-output-proposal.docx");
  let buffer: Buffer;

  if (fs.existsSync(localDocx)) {
    buffer = fs.readFileSync(localDocx);
    console.log(`Using local test file: ${localDocx} (${buffer.byteLength} bytes)`);
  } else {
    buffer = Buffer.from("Test DOCX placeholder content");
    console.log("No local docx found — uploading placeholder buffer");
  }

  const fileName = `TEST_Proposal_${new Date().toISOString().split("T")[0]}.docx`;

  const { fileId, shareableLink } = await uploadToDrive(buffer, fileName);

  console.log(`\nUpload successful.`);
  console.log(`File ID:        ${fileId}`);
  console.log(`Shareable Link: ${shareableLink}`);
  console.log("\nOpen the link in a browser to verify the file is accessible.");
}

main().catch(console.error);
