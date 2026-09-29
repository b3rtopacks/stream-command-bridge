import assert from "node:assert/strict";
import test from "node:test";
import { MemoryTokenStore } from "../src/token-store.js";
import { TwitchAuth } from "../src/twitch-auth.js";

test("starts device authorization without a client secret", async () => {
  const requests: string[] = [];
  const auth = new TwitchAuth({
    clientId: "public-client-id",
    tokenStore: new MemoryTokenStore(),
    fetch: (async (input) => {
      requests.push(String(input));
      return Response.json({
        device_code: "device-code",
        user_code: "USER-CODE",
        verification_uri: "https://www.twitch.tv/activate",
        expires_in: 600,
        interval: 5,
      });
    }) as typeof fetch,
  });

  const authorization = await auth.startDeviceAuthorization();
  assert.equal(authorization.userCode, "USER-CODE");
  assert.equal(requests[0], "https://id.twitch.tv/oauth2/device");
});

test("refreshes an expired access token and persists the rotation", async () => {
  const store = new MemoryTokenStore({
    accessToken: "expired-access-token",
    refreshToken: "old-refresh-token",
    expiresAt: new Date(0).toISOString(),
    scopes: ["user:read:chat"],
  });
  const auth = new TwitchAuth({
    clientId: "public-client-id",
    tokenStore: store,
    fetch: (async () => Response.json({
      access_token: "fresh-access-token",
      refresh_token: "rotated-refresh-token",
      expires_in: 14_400,
      scope: ["user:read:chat"],
    })) as typeof fetch,
  });

  assert.equal(await auth.getAccessToken(), "fresh-access-token");
  assert.equal((await store.load())?.refreshToken, "rotated-refresh-token");
});

test("validates the current token against the configured client", async () => {
  const store = new MemoryTokenStore({
    accessToken: "current-access-token",
    refreshToken: "current-refresh-token",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scopes: ["user:read:chat"],
  });
  const auth = new TwitchAuth({
    clientId: "public-client-id",
    tokenStore: store,
    fetch: (async (_input, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "OAuth current-access-token");
      return Response.json({
        client_id: "public-client-id",
        login: "exampleuser",
        user_id: "user-1",
        scopes: ["user:read:chat"],
        expires_in: 3_600,
      });
    }) as typeof fetch,
  });

  assert.deepEqual(await auth.validateAccessToken(), {
    clientId: "public-client-id",
    login: "exampleuser",
    userId: "user-1",
    scopes: ["user:read:chat"],
    expiresIn: 3_600,
  });
});
