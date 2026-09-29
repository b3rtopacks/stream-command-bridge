import { EventEmitter } from "node:events";
import WebSocket, { type RawData } from "ws";
import { TwitchAuth } from "./twitch-auth.js";
import type { IncomingChatMessage, Permission } from "./types.js";

const EVENTSUB_URL = "wss://eventsub.wss.twitch.tv/ws";
const API_BASE_URL = "https://api.twitch.tv/helix";

interface TwitchUser { id: string; login: string; display_name: string; }
interface EventSubEnvelope {
  metadata?: { message_id?: string; message_type?: string; subscription_type?: string; };
  payload?: {
    session?: { id?: string; reconnect_url?: string };
    subscription?: { status?: string };
    event?: Record<string, unknown>;
  };
}
export interface TwitchChatClientOptions {
  auth: TwitchAuth;
  broadcasterLogin?: string;
  reconnect?: boolean;
  fetch?: typeof fetch;
}
export interface TwitchChatClientEvents {
  message: [message: IncomingChatMessage]; connected: []; disconnected: [];
  status: [status: string]; error: [error: Error];
}

export class TwitchChatClient extends EventEmitter<TwitchChatClientEvents> {
  private readonly auth: TwitchAuth;
  private readonly broadcasterLogin: string | undefined;
  private readonly reconnect: boolean;
  private readonly fetchImpl: typeof fetch;
  private socket: WebSocket | null = null;
  private manuallyClosed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private authValidationTimer: NodeJS.Timeout | null = null;
  private readonly intentionalClosures = new WeakSet<WebSocket>();
  private readonly seenMessageIds = new Map<string, number>();
  private authorizedUser: TwitchUser | null = null;
  private broadcaster: TwitchUser | null = null;

  constructor(options: TwitchChatClientOptions) {
    super();
    this.auth = options.auth;
    this.broadcasterLogin = options.broadcasterLogin?.trim() || undefined;
    this.reconnect = options.reconnect ?? true;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async connect(url = EVENTSUB_URL, reconnectSocket?: WebSocket): Promise<void> {
    this.manuallyClosed = false;
    await this.resolveUsers();
    this.emit("status", "connecting");
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.on("message", (data) => void this.handleEnvelope(data, socket, reconnectSocket));
    socket.on("error", (error) => this.emit("error", asError(error)));
    socket.on("close", () => {
      if (this.manuallyClosed || this.intentionalClosures.has(socket) || this.socket !== socket) return;
      this.socket = null;
      this.emit("disconnected");
      this.emit("status", "disconnected");
      this.scheduleReconnect();
    });
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.authValidationTimer) clearInterval(this.authValidationTimer);
    this.authValidationTimer = null;
    if (this.socket) {
      this.intentionalClosures.add(this.socket);
      this.socket.close();
    }
    this.socket = null;
    this.emit("status", "disconnected");
  }

  private async resolveUsers(): Promise<void> {
    const users = await this.api<{ data: TwitchUser[] }>("/users");
    const authorized = users.data[0];
    if (!authorized) throw new Error("The authorized Twitch user could not be resolved");
    this.authorizedUser = authorized;
    if (this.broadcasterLogin && this.broadcasterLogin.toLowerCase() !== authorized.login.toLowerCase()) {
      const result = await this.api<{ data: TwitchUser[] }>(`/users?login=${encodeURIComponent(this.broadcasterLogin)}`);
      this.broadcaster = result.data[0] ?? null;
      if (!this.broadcaster) throw new Error(`Twitch channel not found: ${this.broadcasterLogin}`);
    } else this.broadcaster = authorized;
  }

  private async handleEnvelope(data: RawData, socket: WebSocket, previousSocket?: WebSocket): Promise<void> {
    try {
      const envelope = JSON.parse(data.toString()) as EventSubEnvelope;
      const type = envelope.metadata?.message_type;
      if (type === "session_welcome") {
        const sessionId = envelope.payload?.session?.id;
        if (!sessionId) throw new Error("Twitch welcome message did not include a session ID");
        this.reconnectAttempts = 0;
        if (previousSocket) {
          this.intentionalClosures.add(previousSocket);
          previousSocket.close();
        }
        else await this.subscribe(sessionId);
        this.emit("connected");
        this.emit("status", "connected");
        this.scheduleAuthValidation();
        return;
      }
      if (type === "session_reconnect") {
        const reconnectUrl = envelope.payload?.session?.reconnect_url;
        if (reconnectUrl) await this.connect(reconnectUrl, socket);
        return;
      }
      if (type === "revocation") {
        throw new Error(`Twitch revoked the chat subscription: ${envelope.payload?.subscription?.status ?? "unknown"}`);
      }
      if (type !== "notification" || envelope.metadata?.subscription_type !== "channel.chat.message") return;
      const messageId = envelope.metadata.message_id;
      if (messageId && this.hasSeen(messageId)) return;
      const message = toChatMessage(messageId ?? "", envelope.payload?.event ?? {});
      if (message) this.emit("message", message);
    } catch (error) { this.emit("error", asError(error)); }
  }

  private async subscribe(sessionId: string): Promise<void> {
    if (!this.authorizedUser || !this.broadcaster) throw new Error("Twitch users are not resolved");
    await this.api("/eventsub/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "channel.chat.message", version: "1",
        condition: { broadcaster_user_id: this.broadcaster.id, user_id: this.authorizedUser.id },
        transport: { method: "websocket", session_id: sessionId },
      }),
    });
  }

  private async api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.auth.getAccessToken();
    const response = await this.fetchImpl(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Client-Id": this.auth.clientId, ...init.headers },
    });
    const data = (await response.json()) as T & { message?: string; error?: string };
    if (!response.ok) throw new Error(data.message ?? data.error ?? `Twitch API request failed (${response.status})`);
    return data;
  }

  private hasSeen(id: string): boolean {
    const now = Date.now();
    for (const [key, expiresAt] of this.seenMessageIds) if (expiresAt <= now) this.seenMessageIds.delete(key);
    if (this.seenMessageIds.has(id)) return true;
    this.seenMessageIds.set(id, now + 10 * 60 * 1000);
    while (this.seenMessageIds.size > 1_000) {
      const oldest = this.seenMessageIds.keys().next().value;
      if (oldest) this.seenMessageIds.delete(oldest);
    }
    return false;
  }

  private scheduleReconnect(): void {
    if (!this.reconnect || this.manuallyClosed || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempts++);
    this.emit("status", `reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch((error) => { this.emit("error", asError(error)); this.scheduleReconnect(); });
    }, delay);
  }

  private scheduleAuthValidation(): void {
    if (this.authValidationTimer) return;
    this.authValidationTimer = setInterval(() => {
      void this.auth.validateAccessToken().catch((error) => this.emit("error", asError(error)));
    }, 60 * 60 * 1000);
    this.authValidationTimer.unref();
  }
}

export function toChatMessage(id: string, event: Record<string, unknown>): IncomingChatMessage | null {
  const text = asString((event.message as { text?: unknown } | undefined)?.text);
  const login = asString(event.chatter_user_login) || asString(event.chatter_user_name).toLowerCase();
  if (!text || !login) return null;
  const userId = asString(event.chatter_user_id);
  const broadcasterId = asString(event.broadcaster_user_id);
  const roles = new Set<Exclude<Permission, "everyone">>();
  const badges = Array.isArray(event.badges) ? event.badges : [];
  for (const badge of badges) {
    const setId = asString((badge as { set_id?: unknown }).set_id);
    if (setId === "founder") roles.add("subscriber");
    if (setId === "subscriber" || setId === "vip" || setId === "moderator" || setId === "broadcaster") roles.add(setId);
  }
  if (userId && userId === broadcasterId) roles.add("broadcaster");
  return {
    id, text, broadcasterId,
    user: { id: userId, login, displayName: asString(event.chatter_user_name) || login, roles },
    receivedAt: new Date(),
  };
}

function asString(value: unknown): string { return typeof value === "string" ? value : ""; }
function asError(value: unknown): Error { return value instanceof Error ? value : new Error(String(value)); }
