import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

async function connect(t, path = "./fixtures/server.mjs", mode = "legacy") {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL(path, import.meta.url))],
    env: { SLACK_TOKEN: "xoxp-test-only" },
    stderr: "pipe",
  });
  const client = new Client({ name: "slack-local-tests", version: "1.0.0" }, {
    versionNegotiation: { mode },
  });
  t.after(async () => { await client.close(); await transport.close(); });
  await client.connect(transport);
  return client;
}

test("real entry point starts and exposes all 11 tools over legacy stdio without Slack traffic", { timeout: 10000 }, async t => {
  const client = await connect(t, "../src/index.js");
  const { tools } = await client.listTools();
  assert.equal(tools.length, 11);
  const send = tools.find(tool => tool.name === "slack_send_message");
  assert.equal(send.annotations.readOnlyHint, false);
  assert.equal(send.annotations.idempotentHint, false);
  assert.ok(send.inputSchema.properties.text);
});

for (const mode of ["legacy", { pin: "2026-07-28" }]) {
  test(`messages cross MCP and HTTP unchanged (${JSON.stringify(mode)})`, { timeout: 10000 }, async t => {
    const client = await connect(t, "./fixtures/server.mjs", mode);
    const body = "  Hello 🌍\n*Release* <https://example.com|link>\n  ";
    const result = await client.callTool({ name: "slack_send_message", arguments: {
      channel: "CTEST", text: body, thread_ts: "123.456", mrkdwn: false,
    } });
    assert.equal(result.isError, undefined);
    const { api_method, payload } = JSON.parse(result.content[0].text);
    assert.equal(api_method, "chat.postMessage");
    assert.equal(payload.text, body);
    assert.equal(payload.thread_ts, "123.456");
    assert.equal(payload.mrkdwn, false);
    assert.deepEqual(Object.keys(payload).sort(), ["channel", "mrkdwn", "parse", "reply_broadcast", "text", "thread_ts", "unfurl_links", "unfurl_media"].sort());
    assert.equal(JSON.stringify(payload).includes("ChatGPT"), false);
  });
}

test("edits clear old message blocks and preserve new text", { timeout: 10000 }, async t => {
  const client = await connect(t);
  const result = await client.callTool({ name: "slack_edit_message", arguments: {
    channel: "DTEST", ts: "123.456", text: "Replacement\n🌍",
  } });
  const { api_method, payload } = JSON.parse(result.content[0].text);
  assert.equal(api_method, "chat.update");
  assert.equal(payload.text, "Replacement\n🌍");
  assert.deepEqual(payload.blocks, []);
});

test("invalid destinations, empty messages, oversized messages and broadcasts without threads are rejected", { timeout: 10000 }, async t => {
  const client = await connect(t);
  for (const args of [
    { channel: "UTEST", text: "Hello" },
    { channel: "CTEST", text: "" },
    { channel: "CTEST", text: "x".repeat(40001) },
    { channel: "CTEST", text: "Hello", reply_broadcast: true },
  ]) {
    const result = await client.callTool({ name: "slack_send_message", arguments: args });
    assert.equal(result.isError, true);
  }
});

test("pagination and DM recipients are passed in Slack's expected format", { timeout: 10000 }, async t => {
  const client = await connect(t);
  const result = await client.callTool({ name: "slack_read_channel", arguments: {
    channel: "CTEST", cursor: "page-two", limit: 10,
  } });
  const data = JSON.parse(result.content[0].text);
  assert.equal(data.payload.cursor, "page-two");
  assert.equal(data.payload.limit, 10);
  assert.equal(data.response_metadata.next_cursor, "next-page");
  const dm = await client.callTool({ name: "slack_open_dm", arguments: { users: ["UFIRST", "USECOND"] } });
  assert.equal(JSON.parse(dm.content[0].text).payload.users, "UFIRST,USECOND");
});

test("missing credentials fail clearly without polluting protocol stdout", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    env: { SLACK_TOKEN: "" }, encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Set SLACK_TOKEN/);
});

test("search parameters survive the MCP-to-Slack form encoding", { timeout: 10000 }, async t => {
  const client = await connect(t);
  const query = 'in:test-channel from:me "a & b"';
  const result = await client.callTool({ name: "slack_search_messages", arguments: { query, count: 1 } });
  const { api_method, payload } = JSON.parse(result.content[0].text);
  assert.equal(api_method, "search.messages");
  assert.deepEqual(payload, { query, count: "1", page: "1", sort: "timestamp", sort_dir: "desc", highlight: "false" });
});
