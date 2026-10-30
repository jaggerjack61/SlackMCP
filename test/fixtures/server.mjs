import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "../../src/server.js";
import { createSlackClient } from "../../src/slack.js";

const callSlack = createSlackClient({
  token: "xoxp-test-only",
  fetchImpl: async (url, options) => Response.json({
    ok: true,
    api_method: url.split("/").at(-1),
    payload: options.headers["Content-Type"].startsWith("application/x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(options.body))
      : JSON.parse(options.body),
    response_metadata: { next_cursor: "next-page" },
  }),
});

serveStdio(() => createServer(callSlack));
