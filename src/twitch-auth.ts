import type { DeviceAuthorization, TokenStore, TwitchTokens } from "./types.js";

const ID_BASE_URL = "https://id.twitch.tv/oauth2";
export const TWITCH_CHAT_SCOPES = ["user:read:chat"] as const;

interface DeviceResponse {
  device_code: string; user_code: string; verification_uri: string;
  expires_in: number; interval: number;
}
interface TokenResponse {
  access_token: string; refresh_token?: string; expires_in: number; scope?: string[];
}
export interface TwitchAuthOptions {
  clientId: string;
  tokenStore: TokenStore;
  scopes?: string[];
  fetch?: typeof fetch;
}

export interface TwitchTokenValidation {
  clientId: string;
  login: string;
  userId: string;
  scopes: string[];
  expiresIn: number;
}

export class TwitchAuth {
  readonly clientId: string;
  readonly scopes: string[];
  private readonly tokenStore: TokenStore;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TwitchAuthOptions) {
    if (!options.clientId.trim()) throw new Error("Twitch clientId is required");
    this.clientId = options.clientId.trim();
    this.tokenStore = options.tokenStore;
    this.scopes = options.scopes ?? [...TWITCH_CHAT_SCOPES];
    this.fetchImpl = options.fetch ?? fetch;
  }

  async startDeviceAuthorization(): Promise<DeviceAuthorization> {
    const data = await this.request<DeviceResponse>(`${ID_BASE_URL}/device`, {
      method: "POST",
      body: new URLSearchParams({ client_id: this.clientId, scopes: this.scopes.join(" ") }),
    });
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      intervalSeconds: data.interval || 5,
    };
  }

  async waitForDeviceAuthorization(authorization: DeviceAuthorization, signal?: AbortSignal): Promise<TwitchTokens> {
    let interval = authorization.intervalSeconds;
    while (Date.now() < authorization.expiresAt.getTime()) {
      await wait(interval * 1000, signal);
      const response = await this.fetchImpl(`${ID_BASE_URL}/token`, {
        method: "POST",
        body: new URLSearchParams({
          client_id: this.clientId,
          scopes: this.scopes.join(" "),
          device_code: authorization.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
        ...(signal ? { signal } : {}),
      });
      const data = (await response.json()) as TokenResponse & { message?: string };
      if (response.ok) return this.saveTokenResponse(data);
      if (data.message === "authorization_pending") continue;
      if (data.message === "slow_down") { interval += 5; continue; }
      throw new Error(`Twitch device authorization failed: ${data.message ?? response.status}`);
    }
    throw new Error("Twitch device authorization expired");
  }

  async getAccessToken(): Promise<string> {
    const tokens = await this.tokenStore.load();
    if (!tokens) throw new Error("Twitch is not authenticated");
    if (new Date(tokens.expiresAt).getTime() - Date.now() > 5 * 60 * 1000) return tokens.accessToken;
    if (!tokens.refreshToken) throw new Error("Twitch refresh token is missing");
    const refreshed = await this.request<TokenResponse>(`${ID_BASE_URL}/token`, {
      method: "POST",
      body: new URLSearchParams({
        client_id: this.clientId,
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }),
    });
    return (await this.saveTokenResponse(refreshed, tokens.refreshToken)).accessToken;
  }

  async validateAccessToken(): Promise<TwitchTokenValidation> {
    const accessToken = await this.getAccessToken();
    const response = await this.fetchImpl(`${ID_BASE_URL}/validate`, {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
    const data = (await response.json()) as {
      client_id?: string;
      login?: string;
      user_id?: string;
      scopes?: string[];
      expires_in?: number;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(data.message ?? `Twitch token validation failed (${response.status})`);
    }
    if (data.client_id !== this.clientId || !data.login || !data.user_id) {
      throw new Error("Twitch token validation returned unexpected account data");
    }
    return {
      clientId: data.client_id,
      login: data.login,
      userId: data.user_id,
      scopes: data.scopes ?? [],
      expiresIn: data.expires_in ?? 0,
    };
  }

  async disconnect(revoke = false): Promise<void> {
    const tokens = await this.tokenStore.load();
    if (revoke && tokens?.accessToken) {
      await this.fetchImpl(`${ID_BASE_URL}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.clientId, token: tokens.accessToken }),
      });
    }
    await this.tokenStore.clear?.();
  }

  private async saveTokenResponse(data: TokenResponse, previousRefreshToken = ""): Promise<TwitchTokens> {
    const tokens: TwitchTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? previousRefreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      scopes: data.scope ?? this.scopes,
    };
    await this.tokenStore.save(tokens);
    return tokens;
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(url, init);
    const data = (await response.json()) as T & { message?: string; error?: string };
    if (!response.ok) throw new Error(data.message ?? data.error ?? `Twitch request failed (${response.status})`);
    return data;
  }
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Aborted"));
    }, { once: true });
  });
}
