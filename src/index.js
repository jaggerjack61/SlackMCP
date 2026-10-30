import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createSlackClient } from "./slack.js";
import { createServer } from "./server.js";

try {
  loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") {
    console.error("Unable to load the project .env file.");
    process.exit(1);
  }
}

try {
  const callSlack = createSlackClient({ token: process.env.SLACK_TOKEN });
  await serveStdio(() => createServer(callSlack), {
    onerror: () => console.error("Slack MCP transport error."),
  });
} catch {
  console.error("Unable to start Slack MCP. Set SLACK_TOKEN in the project .env file or process environment.");
  process.exitCode = 1;
}
