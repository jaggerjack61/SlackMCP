import { McpServer } from "@modelcontextprotocol/server";
import { SlackError } from "./slack.js";
import { tools } from "./tools.js";
import { createUserResolver } from "./users.js";

export function createServer(callSlack) {
  const server = new McpServer({ name: "slack-local", version: "1.0.0" });
  const resolveUsers = createUserResolver(callSlack);
  for (const tool of tools) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: {
        readOnlyHint: tool.readOnly,
        destructiveHint: Boolean(tool.destructive),
        idempotentHint: tool.readOnly || Boolean(tool.idempotent),
        openWorldHint: true,
      },
    }, async args => {
      try {
        const response = await callSlack(tool.method, tool.prepare ? tool.prepare(args) : args);
        const data = tool.resolveUsers ? await resolveUsers(response) : response;
        return { content: [{ type: "text", text: JSON.stringify(data) }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof SlackError ? error.message : "The Slack tool failed. Check Slack before retrying a write." }],
        };
      }
    });
  }
  return server;
}
