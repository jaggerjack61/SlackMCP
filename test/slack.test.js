import assert from "node:assert/strict";
import test from "node:test";
import { createSlackClient, SlackError } from "../src/slack.js";

test("posts only to Slack, preserving the exact payload and keeping the token out of the URL/body", async () => {
  let request;
  const call = createSlackClient({
    token: "xoxp-test-only",
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return Response.json({ ok: true, ts: "123.456" });
    },
  });
  const params = { channel: "CTEST", text: "  Hello 🌍\n*Update* <&>  " };
  assert.equal((await call("chat.postMessage", params)).ts, "123.456");
  assert.equal(request.url, "https://slack.com/api/chat.postMessage");
  assert.equal(request.headers.Authorization, "Bearer xoxp-test-only");
  assert.equal(request.redirect, "error");
  assert.deepEqual(JSON.parse(request.body), params);
  assert.equal(request.body.includes("xoxp-test-only"), false);
});

test("refuses missing tokens without making a request", () => {
  for (const token of [undefined, "", "   "]) {
    assert.throws(() => createSlackClient({ token }), /Set SLACK_TOKEN/);
  }
});

test("search uses form-encoded parameters and keeps query and token out of the URL", async () => {
  let request;
  const call = createSlackClient({ token: "xoxp-test-only", fetchImpl: async (url, options) => {
    request = { url, ...options };
    return Response.json({ ok: true, messages: { matches: [] } });
  } });
  const query = 'in:test-channel from:me "a & b"';
  await call("search.messages", { query, count: 1, page: 1, highlight: false, cursor: undefined });
  assert.equal(request.url, "https://slack.com/api/search.messages");
  assert.match(request.headers["Content-Type"], /^application\/x-www-form-urlencoded/);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(request.body)), { query, count: "1", page: "1", highlight: "false" });
  assert.equal(request.body.includes("xoxp-test-only"), false);
});

test("user lookups are form-encoded because Slack ignores JSON bodies for users.info", async () => {
  let request;
  const call = createSlackClient({ token: "xoxp-test-only", fetchImpl: async (url, options) => {
    request = { url, ...options };
    return Response.json({ ok: true, user: { id: "UTEST" } });
  } });
  await call("users.info", { user: "UTEST" });
  assert.equal(request.url, "https://slack.com/api/users.info");
  assert.match(request.headers["Content-Type"], /^application\/x-www-form-urlencoded/);
  assert.equal(request.body, "user=UTEST");
});

test("reports rate limits without automatically resending", async () => {
  let calls = 0;
  const call = createSlackClient({ token: "test", fetchImpl: async () => {
    calls += 1;
    return new Response("", { status: 429, headers: { "retry-after": "60" } });
  } });
  await assert.rejects(call("chat.postMessage", {}), /Retry after 60 seconds/);
  assert.equal(calls, 1);
});

test("reports Slack errors and missing scopes", async () => {
  const call = createSlackClient({ token: "test", fetchImpl: async () =>
    Response.json({ ok: false, error: "missing_scope", needed: "chat:write" }) });
  await assert.rejects(call("chat.postMessage", {}), /missing_scope.*chat:write/);
});

test("does not leak network error details or retry uncertain writes", async () => {
  let calls = 0;
  const call = createSlackClient({ token: "secret-test-token", fetchImpl: async () => {
    calls += 1;
    throw new Error("secret-test-token");
  } });
  await assert.rejects(call("chat.postMessage", {}), error => {
    assert.ok(error instanceof SlackError);
    assert.match(error.message, /Delivery may be unknown/);
    assert.equal(error.message.includes("secret-test-token"), false);
    return true;
  });
  assert.equal(calls, 1);
});

test("handles HTTP failures and malformed API responses", async () => {
  const responses = [
    new Response("secret-test-token", { status: 503 }),
    new Response("invalid-json"),
    Response.json(null),
    Response.json({}),
  ];
  for (const response of responses) {
    const call = createSlackClient({ token: "test", fetchImpl: async () => response });
    await assert.rejects(call("chat.postMessage", {}), error => {
      assert.ok(error instanceof SlackError);
      assert.equal(error.message.includes("secret-test-token"), false);
      return true;
    });
  }
});
