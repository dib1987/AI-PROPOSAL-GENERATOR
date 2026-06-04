/**
 * Lightweight HTTP server that receives Typeform webhook POST requests,
 * validates the HMAC signature, and triggers the typeform-webhook Trigger.dev task.
 *
 * Run locally:  npx ts-node src/server/webhook-receiver.ts
 * Deploy:       any Node.js host (Railway, Render, Fly.io, EC2, etc.)
 *
 * Point your Typeform webhook URL at:  http://<your-host>:<PORT>/webhook/typeform
 *
 * Required env vars (in addition to .env.example):
 *   TRIGGER_SECRET_KEY  — from Trigger.dev dashboard > Settings > API Keys
 *   PORT                — optional, defaults to 3000
 */
import * as http from "node:http";
import { createHmac } from "node:crypto";
import * as dotenv from "dotenv";
dotenv.config();

import { typeformWebhook } from "../trigger/tasks/typeform-webhook";
import type { TypeformWebhookPayload } from "../trigger/types";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function validateHmac(rawBody: string, signature: string, secret: string): boolean {
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("base64");
  return signature === expected;
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/webhook/typeform") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  let rawBody: string;
  try {
    rawBody = await readBody(req);
  } catch {
    res.writeHead(400);
    res.end("Could not read request body");
    return;
  }

  // ── HMAC validation ────────────────────────────────────────────────────────
  const secret = process.env.TYPEFORM_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers["typeform-signature"] as string ?? "";
    if (!validateHmac(rawBody, signature, secret)) {
      console.warn("[webhook-receiver] Invalid HMAC signature — request rejected");
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }
    console.log("[webhook-receiver] HMAC signature valid");
  } else {
    console.warn("[webhook-receiver] TYPEFORM_WEBHOOK_SECRET not set — skipping signature check");
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: TypeformWebhookPayload;
  try {
    body = JSON.parse(rawBody) as TypeformWebhookPayload;
  } catch {
    res.writeHead(400);
    res.end("Invalid JSON body");
    return;
  }

  if (body.event_type !== "form_response") {
    // Typeform sends a ping on webhook creation — acknowledge and ignore
    res.writeHead(200);
    res.end(JSON.stringify({ received: true, action: "ignored", reason: "not form_response" }));
    return;
  }

  // ── Trigger Trigger.dev task ───────────────────────────────────────────────
  const headers: Record<string, string> = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (typeof val === "string") headers[key] = val;
  }

  try {
    const handle = await typeformWebhook.trigger({ headers, body });
    console.log(`[webhook-receiver] Task triggered — run ID: ${handle.id}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true, runId: handle.id }));
  } catch (err) {
    console.error("[webhook-receiver] Failed to trigger task:", (err as Error).message);
    res.writeHead(500);
    res.end("Failed to queue task");
  }
});

server.listen(PORT, () => {
  console.log(`[webhook-receiver] Listening on port ${PORT}`);
  console.log(`[webhook-receiver] Typeform webhook URL: http://<your-host>:${PORT}/webhook/typeform`);
  console.log(`[webhook-receiver] Health check: http://localhost:${PORT}/health`);
});
