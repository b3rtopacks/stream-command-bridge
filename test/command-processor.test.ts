import assert from "node:assert/strict";
import test from "node:test";
import { CommandProcessor } from "../src/command-processor.js";
import type { IncomingChatMessage, Permission } from "../src/types.js";

function message(text: string, roles: Exclude<Permission, "everyone">[] = [], user = "viewer"): IncomingChatMessage {
  return {
    id: "message-1", text, broadcasterId: "channel-1", receivedAt: new Date(0),
    user: { id: user, login: user, displayName: user, roles: new Set(roles) },
  };
}

test("emits the neutral public event shape", () => {
  assert.deepEqual(new CommandProcessor().handle(message("!openpack")), {
    command: "openpack", user: "viewer", args: [],
  });
});

test("enforces permission levels", () => {
  const processor = new CommandProcessor({ commands: { reset: { permission: "moderator" } } });
  assert.equal(processor.handle(message("!reset")), null);
  assert.deepEqual(processor.handle(message("!reset", ["moderator"])), {
    command: "reset", user: "viewer", args: [],
  });
});

test("enforces global and per-user cooldowns", () => {
  let now = 1_000;
  const global = new CommandProcessor({ commands: { go: { cooldownMs: 1_000 } }, now: () => now });
  assert.ok(global.handle(message("!go")));
  assert.equal(global.handle(message("!go", [], "other")), null);
  now = 2_000;
  assert.ok(global.handle(message("!go", [], "other")));

  const perUser = new CommandProcessor({ commands: { go: { userCooldownMs: 1_000 } }, now: () => now });
  assert.ok(perUser.handle(message("!go")));
  assert.equal(perUser.handle(message("!go")), null);
  assert.ok(perUser.handle(message("!go", [], "other")));
});
