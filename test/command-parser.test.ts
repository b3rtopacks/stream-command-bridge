import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "../src/command-parser.js";

test("parses a command and arguments", () => {
  assert.deepEqual(parseCommand("!openpack alpha beta"), { command: "openpack", args: ["alpha", "beta"] });
});

test("normalizes command names and supports quoted arguments", () => {
  assert.deepEqual(parseCommand('  !ShoutOut "Example User" one\\ two  '), {
    command: "shoutout", args: ["Example User", "one two"],
  });
});

test("ignores ordinary chat and empty commands", () => {
  assert.equal(parseCommand("hello chat"), null);
  assert.equal(parseCommand("!   "), null);
});
