import { google } from "googleapis";
import { config } from "./env";

/**
 * Cliente OAuth2 único para Drive, Sheets e YouTube.
 * Usa refresh token — o access token é renovado automaticamente pela lib.
 */
export function googleAuth() {
  const oauth2 = new google.auth.OAuth2(
    config.google.clientId(),
    config.google.clientSecret()
  );
  oauth2.setCredentials({ refresh_token: config.google.refreshToken() });
  return oauth2;
}

export function driveClient() {
  return google.drive({ version: "v3", auth: googleAuth() });
}

export function sheetsClient() {
  return google.sheets({ version: "v4", auth: googleAuth() });
}

export function youtubeClient() {
  return google.youtube({ version: "v3", auth: googleAuth() });
}
