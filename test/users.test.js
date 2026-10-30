import assert from "node:assert/strict";
import test from "node:test";
import { SlackError } from "../src/slack.js";
import { createUserResolver } from "../src/users.js";

const people = {
  UALICE: { name: "alice", real_name: "Alice Moyo", profile: { display_name: "alice.m" } },
  UBOB: { name: "bob", real_name: "Bob Dube", profile: { display_name: "" } },
};

function fakeSlack() {
  const calls = [];
  const callSlack = async (method, params) => {
    calls.push([method, params.user]);
    if (!people[params.user]) throw new SlackError("Slack API error: user_not_found.");
    return { ok: true, user: people[params.user] };
  };
  return { calls, callSlack };
}

const history = () => ({
  ok: true,
  messages: [{
    user: "UALICE",
    text: "<@UBOB> please review, cc <@UALICE|alice> and <@UGHOST>",
    edited: { user: "UALICE", ts: "2.0" },
    reply_users: ["UBOB"],
    blocks: [{ type: "rich_text", elements: [{ type: "rich_text_section", elements: [{ type: "user", user_id: "UBOB" }] }] }],
  }],
});

test("mentions and author IDs resolve to names while IDs stay available", async () => {
  const { callSlack } = fakeSlack();
  const data = await createUserResolver(callSlack)(history());
  const [message] = data.messages;
  assert.equal(message.text, "@Bob Dube please review, cc @alice.m and <@UGHOST>");
  assert.equal(message.user, "UALICE");
  assert.equal(message.user_name, "alice.m");
  assert.equal(message.edited.user_name, "alice.m");
  assert.equal(message.blocks[0].elements[0].elements[0].name, "Bob Dube");
  assert.deepEqual(data.user_names, { UALICE: "alice.m", UBOB: "Bob Dube" });
});

test("successful lookups are cached and failed ones are retried later", async () => {
  const { calls, callSlack } = fakeSlack();
  const resolveUsers = createUserResolver(callSlack);
  await resolveUsers(history());
  await resolveUsers(history());
  const count = id => calls.filter(([, user]) => user === id).length;
  assert.equal(count("UALICE"), 1);
  assert.equal(count("UBOB"), 1);
  assert.equal(count("UGHOST"), 2);
  assert.ok(calls.every(([method]) => method === "users.info"));
});

test("responses without users are returned untouched", async () => {
  const { calls, callSlack } = fakeSlack();
  const data = { ok: true, messages: [{ text: "no mentions here", bot_id: "B1" }] };
  assert.equal(await createUserResolver(callSlack)(data), data);
  assert.equal(calls.length, 0);
});
