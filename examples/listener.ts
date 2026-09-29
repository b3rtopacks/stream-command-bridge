import "dotenv/config";
import { resolve } from "node:path";
import { JsonFileTokenStore, StreamCommandBridge, TwitchAuth } from "../src/index.js";

const clientId = process.env.TWITCH_CLIENT_ID?.trim();
if (!clientId) throw new Error("Set TWITCH_CLIENT_ID in .env before running the example");

const auth = new TwitchAuth({
  clientId,
  tokenStore: new JsonFileTokenStore(resolve(".data/twitch-tokens.json")),
});

try {
  await auth.getAccessToken();
} catch {
  const authorization = await auth.startDeviceAuthorization();
  console.log(`Open ${authorization.verificationUri}`);
  console.log(`Enter code: ${authorization.userCode}`);
  await auth.waitForDeviceAuthorization(authorization);
}

const bridge = new StreamCommandBridge({
  auth,
  ...(process.env.TWITCH_BROADCASTER_LOGIN
    ? { broadcasterLogin: process.env.TWITCH_BROADCASTER_LOGIN }
    : {}),
  prefix: process.env.COMMAND_PREFIX || "!",
  commands: {
    openpack: { permission: "everyone", userCooldownMs: 5_000 },
    reset: { permission: "moderator", cooldownMs: 10_000 },
  },
});

bridge.on("command", (event) => {
  // Send this event to your app, overlay, queue, IPC layer, or webhook.
  console.log(JSON.stringify(event));
});
bridge.on("ignored", ({ reason, command, retryAfterMs }) => {
  if (command) console.log("Ignored", command.command, reason, retryAfterMs ?? "");
});
bridge.on("status", (status) => console.log("Twitch:", status));
bridge.on("error", (error) => console.error("Bridge error:", error.message));

await bridge.connect();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    bridge.disconnect();
    process.exit(0);
  });
}
