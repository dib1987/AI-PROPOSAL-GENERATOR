import { google } from "googleapis";
import { Readable } from "node:stream";

const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function buildDriveClient() {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing OAuth2 env vars: GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN");
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: "v3", auth });
}

export async function uploadToDrive(
  docxBuffer: Buffer,
  fileName: string
): Promise<{ fileId: string; shareableLink: string }> {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID env var is not set");

  const drive = buildDriveClient();

  // Upload the file
  const uploadRes = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: MIME_DOCX,
    },
    media: {
      mimeType: MIME_DOCX,
      body: Readable.from(docxBuffer),
    },
    fields: "id, webViewLink, name",
  });

  const fileId = uploadRes.data.id;
  if (!fileId) throw new Error("Drive upload succeeded but returned no file ID");

  // Make the file readable by anyone with the link
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  // Fetch the final webViewLink (shareable link)
  const metaRes = await drive.files.get({
    fileId,
    fields: "webViewLink",
  });

  const shareableLink = metaRes.data.webViewLink;
  if (!shareableLink) throw new Error("Drive file created but shareable link not returned");

  return { fileId, shareableLink };
}
