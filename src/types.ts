export type Permission = "everyone" | "subscriber" | "vip" | "moderator" | "broadcaster";

export interface CommandEvent { command: string; user: string; args: string[]; }

export interface ChatUser {
  id: string;
  login: string;
  displayName: string;
  roles: Set<Exclude<Permission, "everyone">>;
}

export interface IncomingChatMessage {
  id: string;
  text: string;
  broadcasterId: string;
  user: ChatUser;
  receivedAt: Date;
}

export interface CommandDefinition {
  permission?: Permission;
  cooldownMs?: number;
  userCooldownMs?: number;
}

export type IgnoreReason = "not-a-command" | "unknown-command" | "permission-denied" | "global-cooldown" | "user-cooldown";

export interface IgnoredCommandEvent {
  reason: IgnoreReason;
  message: IncomingChatMessage;
  command?: CommandEvent;
  retryAfterMs?: number;
}

export interface TwitchTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
}

export interface TokenStore {
  load(): Promise<TwitchTokens | null>;
  save(tokens: TwitchTokens): Promise<void>;
  clear?(): Promise<void>;
}

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: Date;
  intervalSeconds: number;
}
