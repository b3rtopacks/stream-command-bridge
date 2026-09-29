import assert from "node:assert/strict";
import test from "node:test";
import { toChatMessage } from "../src/twitch-chat-client.js";

test("normalizes EventSub chat users and badges", () => {
  const message = toChatMessage("event-1", {
    broadcaster_user_id: "channel-1",
    chatter_user_id: "user-1",
    chatter_user_login: "exampleuser",
    chatter_user_name: "ExampleUser",
    message: { text: "!openpack one" },
    badges: [{ set_id: "moderator", id: "1", info: "" }],
  });
  assert.equal(message?.text, "!openpack one");
  assert.equal(message?.user.login, "exampleuser");
  assert.deepEqual([...message!.user.roles], ["moderator"]);
});

test("recognizes a broadcaster even without a badge", () => {
  const message = toChatMessage("event-2", {
    broadcaster_user_id: "channel-1", chatter_user_id: "channel-1",
    chatter_user_login: "owner", chatter_user_name: "Owner", message: { text: "!reset" },
  });
  assert.equal(message?.user.roles.has("broadcaster"), true);
});
