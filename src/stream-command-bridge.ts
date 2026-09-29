import { EventEmitter } from "node:events";
import { CommandProcessor, type CommandProcessorOptions } from "./command-processor.js";
import { TwitchChatClient, type TwitchChatClientOptions } from "./twitch-chat-client.js";
import type { CommandEvent, IgnoredCommandEvent, IncomingChatMessage } from "./types.js";

export interface StreamCommandBridgeOptions extends CommandProcessorOptions, TwitchChatClientOptions {}
export interface StreamCommandBridgeEvents {
  command: [event: CommandEvent]; message: [message: IncomingChatMessage];
  ignored: [event: IgnoredCommandEvent]; connected: []; disconnected: [];
  status: [status: string]; error: [error: Error];
}

export class StreamCommandBridge extends EventEmitter<StreamCommandBridgeEvents> {
  readonly commands: CommandProcessor;
  readonly chat: TwitchChatClient;
  constructor(options: StreamCommandBridgeOptions) {
    super();
    this.commands = new CommandProcessor(options);
    this.chat = new TwitchChatClient(options);
    this.chat.on("message", (message) => { this.emit("message", message); this.commands.handle(message); });
    this.chat.on("connected", () => this.emit("connected"));
    this.chat.on("disconnected", () => this.emit("disconnected"));
    this.chat.on("status", (status) => this.emit("status", status));
    this.chat.on("error", (error) => this.emit("error", error));
    this.commands.on("command", (event) => this.emit("command", event));
    this.commands.on("ignored", (event) => this.emit("ignored", event));
  }
  connect(): Promise<void> { return this.chat.connect(); }
  disconnect(): void { this.chat.disconnect(); }
}
