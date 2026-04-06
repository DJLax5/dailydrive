#!/usr/bin/env node
// =============================================================================
// Daily Drive — First-Time Setup
// =============================================================================
// This script authenticates your Spotify account and saves a token file.
// You only need to run this ONCE (or again if your token expires after months).
//
// Usage:  npm run setup
// =============================================================================

const fs = require("fs");
const yaml = require("js-yaml");
const SpotifyWebApi = require("spotify-web-api-node");
const express = require("express");

const TOKEN_FILE = ".spotify-token.json";
const CONFIG_FILE = "config.yaml";

// --- Reuse the token file path if it already exists ---
// On Windows/Docker Desktop, bind-mounted files can be locked for unlink.
// We overwrite the file later when auth succeeds, so deletion is unnecessary.
if (fs.existsSync(TOKEN_FILE)) {
  console.log(`ℹ️  Token file already exists at ${TOKEN_FILE} — it will be overwritten after login`);
}

// --- Load config ---
if (!fs.existsSync(CONFIG_FILE)) {
  console.error("\n❌ config.yaml not found!");
  console.error("   Run: cp config.example.yaml config.yaml");
  console.error("   Then fill in your Spotify credentials.\n");
  process.exit(1);
}

const config = yaml.load(fs.readFileSync(CONFIG_FILE, "utf8"));
const { client_id, client_secret, redirect_uri } = config.spotify;

if (
  !client_id ||
  !client_secret ||
  client_id === "your-client-id-here"
) {
  console.error("\n❌ Please fill in your Spotify credentials in config.yaml");
  console.error("   See README.md for how to get them.\n");
  process.exit(1);
}

// --- Set up Spotify client ---
const spotifyApi = new SpotifyWebApi({
  clientId: client_id,
  clientSecret: client_secret,
  redirectUri: redirect_uri,
});

const SCOPES = [
  "playlist-modify-public",
  "playlist-modify-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-read-private",
  "user-read-recently-played",
  "user-top-read",
];

// --- Start a tiny web server to catch the callback ---
const app = express();
const port = new URL(redirect_uri).port || 8888;
const runningInDocker = fs.existsSync("/.dockerenv");
const callbackBindHost =
  process.env.SETUP_BIND_HOST || (runningInDocker ? "0.0.0.0" : "127.0.0.1");

app.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    res.send(`<h1>Error: ${error}</h1><p>Please try again.</p>`);
    console.error(`\n❌ Authorization failed: ${error}\n`);
    process.exit(1);
  }

  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    const tokenData = {
      access_token: data.body.access_token,
      refresh_token: data.body.refresh_token,
      expires_at: Date.now() + data.body.expires_in * 1000,
    };

    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2));

    res.send(
      "<h1>✅ Success!</h1><p>You can close this window. Daily Drive is ready to go!</p>"
    );
    console.log("\n✅ Authentication successful!");
    console.log(`   Token saved to ${TOKEN_FILE}`);
    console.log("\n   You can now run: npm start\n");

    // Give the browser a moment to show the success page
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    res.send(`<h1>Error</h1><p>${err.message}</p>`);
    console.error("\n❌ Token exchange failed:", err.message, "\n");
    process.exit(1);
  }
});

// Spotify redirect URI can still be 127.0.0.1 while we bind 0.0.0.0 in Docker
app.listen(port, callbackBindHost, () => {
  const authUrl = spotifyApi.createAuthorizeURL(SCOPES, "dailydrive");

  console.log("\n🎵 Daily Drive — Setup\n");
  console.log("Open this URL in your browser to authorize:\n");
  console.log(`  ${authUrl}\n`);
  if (runningInDocker && callbackBindHost === "0.0.0.0") {
    console.log(
      "Running in Docker: callback server is bound to 0.0.0.0 so published ports can receive Spotify redirects."
    );
  }

  // Try to open the browser automatically (works on desktop, not headless)
  import("open")
    .then((open) => open.default(authUrl))
    .catch(() => {
      // If running headless, user will need to copy/paste the URL
      console.log(
        "(If you're on a headless server, copy the URL above to a browser on another machine.)"
      );
      console.log(
        `Make sure your Spotify app's redirect URI is set to: ${redirect_uri}\n`
      );
    });
});
