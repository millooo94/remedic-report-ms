import http from "http";
import open from "open";
import { google } from "googleapis";
import { env, getMissingEnv } from "./src/config/env.js";

const missingOAuthEnv = getMissingEnv([
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
]);

if (missingOAuthEnv.length > 0) {
  throw new Error(
    `Missing env vars for OAuth setup: ${missingOAuthEnv.join(", ")}`,
  );
}

const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback";

const oauth2Client = new google.auth.OAuth2(
  env.googleClientId,
  env.googleClientSecret,
  REDIRECT_URI,
);

const scopes = ["https://www.googleapis.com/auth/drive"];

const url = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: scopes,
});

console.log("Aprendo browser per autorizzazione...");

open(url);

http
  .createServer(async (req, res) => {
    if (req.url.indexOf("/oauth2callback") > -1) {
      const qs = new URL(req.url, "http://localhost:3000").searchParams;
      const code = qs.get("code");
      const { tokens } = await oauth2Client.getToken(code);

      console.log("\nREFRESH TOKEN:\n");
      console.log(tokens.refresh_token);

      res.end("Autorizzazione completata. Torna al terminale.");
      process.exit();
    }
  })
  .listen(3000);
