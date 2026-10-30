# Local Slack MCP

A local MCP server that calls Slack's Web API directly. Message text is sent exactly as supplied. The server adds no “sent by ChatGPT” text, signature, footer, branding blocks, or attribution metadata. It uses the official MCP SDK and supports both legacy and 2026-07-28 stdio clients.

Slack still controls the displayed sender and app/bot indicators. Use a **User OAuth Token** (`xoxp-…`) to act as your own Slack account. A **Bot User OAuth Token** (`xoxb-…`) acts as the app's bot. This server cannot suppress Slack's own identity indicators or organization policies. It has separate credentials from the hosted Slack plugin.

## Setup

Requires Node.js 22.16 or later. Dependencies are already installed in this checkout. For a fresh checkout, run `npm ci --ignore-scripts`.

1. Open [Slack's app management page](https://api.slack.com/apps), choose **Create New App → From a manifest**, select your workspace, and paste `slack-app-manifest.json`. The manifest requests user scopes for the tools below. For sending/editing only, keep just `chat:write` and supply the destination conversation ID yourself.
2. Under **OAuth & Permissions**, install the app into your workspace (workspace approval may be required). Copy the **User OAuth Token** into a local `.env` file. Do not put the token into a chat or commit it.
3. From this project directory, run:

   ```sh
   cp .env.example .env
   chmod 600 .env
   ```

   Set the file's single value to your own token:

   ```dotenv
   SLACK_TOKEN=your-local-slack-token
   ```

4. Add this server to your MCP client using one of the samples in `config/`. Replace `/absolute/path/to/slack-mcp-local` with the actual project path. If the desktop client cannot find `node`, use the absolute path printed by `command -v node`. The server loads `.env` beside `package.json` regardless of the client's working directory. An existing process environment `SLACK_TOKEN` takes precedence over `.env`.
5. Reload your MCP client's connections and run `slack_auth_test` to verify the workspace/account before posting. Select `slack-local` for messaging so the hosted Slack plugin is not used instead.

For Codex, copy the table in `config/codex.toml.example` into `~/.codex/config.toml`, after replacing the project path. For clients using an `mcpServers` JSON object, merge the entry from `config/mcp.json.example` into their configuration. The hosted plugin can remain installed; explicitly select this local server for messaging.

On Node.js 24 or later, set `NODE_USE_ENV_PROXY=1` when launching if your environment requires an HTTP proxy. Allow the MCP host to forward `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, their lowercase equivalents, and `NODE_EXTRA_CA_CERTS` as needed. Forward their names rather than copying proxy credentials into configuration files.

`npm start` launches the stdio server. It waits for an MCP client; it is not an interactive terminal application. Credentials are read only at startup, so reconnect after changing them.

## Tools and scopes

| Tool | Purpose | Scopes |
| --- | --- | --- |
| `slack_auth_test` | Verify token identity | No extra scope |
| `slack_list_conversations` | List channels and DMs | `channels:read`, `groups:read`, `im:read`, `mpim:read` for the types requested |
| `slack_read_channel` | Read channel or DM history | Matching `channels:history`, `groups:history`, `im:history`, or `mpim:history` |
| `slack_read_thread` | Read parent message and replies | Matching history scope; channel threads require a user token |
| `slack_list_users` | Resolve workspace user IDs | `users:read` |
| `slack_search_messages` | Search accessible messages | User token with `search:read` |
| `slack_send_message` | Send exact text, optionally in a thread | `chat:write` |
| `slack_edit_message` | Replace an editable message's body and clear its old blocks | `chat:write` |
| `slack_open_dm` | Open/resume an authorized DM or group DM | `im:write` or `mpim:write` |
| `slack_get_permalink` | Get a message link | No extra scope |
| `slack_add_reaction` | Add an emoji reaction | `reactions:write` |

Use a conversation ID beginning with `C`, `G`, or `D` for sending/editing, rather than a person's user ID. Use `slack_open_dm` first when necessary. Keep message timestamps as strings. Only edit messages the configured account/token is allowed to edit.

Messages use Slack `mrkdwn` (`*bold*`, `_italic_`, `<url|label>`), not standard Markdown. `slack_send_message` also supports `mrkdwn: false`. Link/media unfurls default to off. Explicitly request them if desired. Text has a 40,000-character limit; Slack's own rendering and limits still apply. The server never strips user-supplied text, including a signature you explicitly include.

`slack_read_channel`, `slack_read_thread` and `slack_search_messages` resolve user IDs to names: `<@U…>` mentions in `text` become `@Name`, message objects gain `user_name`, and a top-level `user_names` map keeps each ID available for `<@ID>` mentions when sending. Lookups use `users.info` (`users:read`) and are cached for the life of the process. If a lookup fails, that ID is left unchanged and the read still succeeds.

Reads return one page. Follow `response_metadata.next_cursor` by supplying `cursor` on the next call. Search uses `paging.pages` and the `page` argument. Search can include private channels and DMs accessible to the token; the client should only search/share information within the user's authorized scope.

Requests go only to `https://slack.com/api/`; redirects are rejected. No separate telemetry or hosted proxy is used. API failures are returned as tool errors without logging message bodies or tokens. Writes are never retried automatically; after an uncertain network failure, check history before resending to avoid duplicates. Rate-limit errors include Slack's retry delay when supplied.

## Verification

```sh
npm test
```

The tests use mocked Slack responses and a real MCP client/server connection over stdio. They cover legacy and modern MCP negotiation, exact message preservation, absence of appended branding, edit behavior, pagination, validation, missing credentials, rate limits, and safe handling of uncertain failures. They do not send real Slack messages or prove workspace-specific OAuth access. A live check requires your own token and an explicitly authorized destination/message.

## References

- [MCP server guide](https://modelcontextprotocol.io/docs/develop/build-server)
- [Slack chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/)
- [Slack chat.update](https://docs.slack.dev/reference/methods/chat.update/)
- [Slack search.messages](https://docs.slack.dev/reference/methods/search.messages/)
- [Slack conversations.replies](https://docs.slack.dev/reference/methods/conversations.replies/)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp/)
