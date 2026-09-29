import type { CommandEvent } from "./types.js";

export interface ParsedCommand extends Omit<CommandEvent, "user"> {}

/** Parses a prefixed command and supports quoted or backslash-escaped arguments. */
export function parseCommand(message: string, prefix = "!"): ParsedCommand | null {
  const input = message.trim();
  if (!prefix || !input.startsWith(prefix)) return null;
  const body = input.slice(prefix.length).trim();
  if (!body) return null;

  const tokens: string[] = [];
  let token = "";
  let quote: "\"" | "'" | null = null;
  let escaping = false;
  for (const character of body) {
    if (escaping) { token += character; escaping = false; }
    else if (character === "\\") escaping = true;
    else if (quote) { if (character === quote) quote = null; else token += character; }
    else if (character === "\"" || character === "'") quote = character;
    else if (/\s/.test(character)) {
      if (token) { tokens.push(token); token = ""; }
    } else token += character;
  }
  if (escaping) token += "\\";
  if (token) tokens.push(token);
  const [name, ...args] = tokens;
  if (!name) return null;
  return { command: name.toLowerCase(), args };
}
