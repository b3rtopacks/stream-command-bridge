import { EventEmitter } from "node:events";
import { parseCommand } from "./command-parser.js";
import { hasPermission } from "./permissions.js";
import type { CommandDefinition, CommandEvent, IgnoredCommandEvent, IncomingChatMessage } from "./types.js";

export interface CommandProcessorOptions {
  prefix?: string;
  commands?: Record<string, CommandDefinition>;
  now?: () => number;
}

export interface CommandProcessorEvents {
  command: [event: CommandEvent];
  ignored: [event: IgnoredCommandEvent];
}

export class CommandProcessor extends EventEmitter<CommandProcessorEvents> {
  private readonly prefix: string;
  private readonly commands = new Map<string, CommandDefinition>();
  private readonly globalCooldowns = new Map<string, number>();
  private readonly userCooldowns = new Map<string, number>();
  private readonly now: () => number;

  constructor(options: CommandProcessorOptions = {}) {
    super();
    this.prefix = options.prefix ?? "!";
    this.now = options.now ?? Date.now;
    for (const [name, definition] of Object.entries(options.commands ?? {})) this.register(name, definition);
  }

  register(name: string, definition: CommandDefinition = {}): this {
    const trimmed = name.trim();
    const normalized = (trimmed.startsWith(this.prefix) ? trimmed.slice(this.prefix.length) : trimmed).toLowerCase();
    if (!normalized || /\s/.test(normalized)) throw new Error("Command names must be one non-empty token");
    this.commands.set(normalized, definition);
    return this;
  }

  unregister(name: string): boolean { return this.commands.delete(name.toLowerCase()); }

  handle(message: IncomingChatMessage): CommandEvent | null {
    const parsed = parseCommand(message.text, this.prefix);
    if (!parsed) { this.emit("ignored", { reason: "not-a-command", message }); return null; }
    const event: CommandEvent = { command: parsed.command, user: message.user.login, args: parsed.args };
    const definition = this.commands.get(parsed.command);
    if (this.commands.size > 0 && !definition) {
      this.emit("ignored", { reason: "unknown-command", message, command: event }); return null;
    }
    if (!hasPermission(message.user, definition?.permission)) {
      this.emit("ignored", { reason: "permission-denied", message, command: event }); return null;
    }

    const now = this.now();
    const globalUntil = this.globalCooldowns.get(parsed.command) ?? 0;
    if (globalUntil > now) {
      this.emit("ignored", { reason: "global-cooldown", message, command: event, retryAfterMs: globalUntil - now }); return null;
    }
    const userKey = `${parsed.command}:${message.user.id || message.user.login}`;
    const userUntil = this.userCooldowns.get(userKey) ?? 0;
    if (userUntil > now) {
      this.emit("ignored", { reason: "user-cooldown", message, command: event, retryAfterMs: userUntil - now }); return null;
    }
    if (definition?.cooldownMs && definition.cooldownMs > 0) this.globalCooldowns.set(parsed.command, now + definition.cooldownMs);
    if (definition?.userCooldownMs && definition.userCooldownMs > 0) this.userCooldowns.set(userKey, now + definition.userCooldownMs);
    this.emit("command", event);
    return event;
  }
}
