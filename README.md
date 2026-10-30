# SlackMCP

[![Node.js](https://img.shields.io/badge/node-%3E%3D22.16-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-5A45FF)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A self-hosted Model Context Protocol server for Slack.** SlackMCP gives AI assistants such as Codex, Claude, and other MCP clients direct access to your Slack workspace. Your assistant can read, search, and send messages as you, with no signatures, footers, or attribution added.

SlackMCP runs on your own machine and talks directly to Slack's Web API. It uses no hosted proxy and sends no telemetry, and your token stays on your machine.

---

## Why SlackMCP

- **Messages are sent exactly as written.** SlackMCP never adds "sent by" text, signatures, footers, branding blocks, or attribution metadata. What you write is what your colleagues see.
- **It acts as you.** With a User OAuth Token, messages come from your own Slack account, not a bot.
- **Data goes only to Slack.** Requests go only to `https://slack.com/api/`, redirects are refused, and tokens and message bodies are never logged.
- **Results are readable.** Read and search results replace raw user IDs with display names, so assistants can follow a conversation without extra lookups.
- **Writes are handled safely.** Writes are never retried automatically, so a failed or uncertain send cannot produce a duplicate. Rate limits come back with Slack's suggested retry delay.
- **It follows the standard.** It is built on the official MCP SDK and works with both earlier and current (2026-07-28) MCP stdio clients.

## Features

| Tool | Description | Required scopes |
| --- | --- | --- |
| `slack_auth_test` | Verify the connected workspace and account | None |
| `slack_list_conversations` | List channels, private channels, DMs, and group DMs | `channels:read`, `groups:read`, `im:read`, `mpim:read` |
| `slack_read_channel` | Read channel or DM history | `channels:history`, `groups:history`, `im:history`, `mpim:history` |
| `slack_read_thread` | Read a message and its thread replies | Matching `*:history` scope |
| `slack_search_messages` | Search every conversation the token can see | `search:read` |
| `slack_list_users` | List workspace members and their IDs | `users:read` |
| `slack_send_message` | Send a message, optionally as a thread reply | `chat:write` |
| `slack_edit_message` | Replace the text of an existing message | `chat:write` |
| `slack_open_dm` | Open or resume a DM or group DM | `im:write`, `mpim:write` |
| `slack_get_permalink` | Get a shareable link to a message | None |
| `slack_add_reaction` | Add an emoji reaction to a message | `reactions:write` |

Each tool carries MCP annotations (read-only, destructive, idempotent), so clients can tell safe reads from writes and ask for confirmation before writes.

## Requirements

- Node.js **22.16 or later**
- A Slack workspace where you can install apps (some workspaces need admin approval)
- An MCP-compatible client, such as Codex, Claude Desktop, Claude Code, or Cursor

## Installation

```sh
git clone https://github.com/jaggerjack61/SlackMCP.git
cd SlackMCP
npm ci --ignore-scripts
```

## Configuration

### 1. Create the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and choose **Create New App → From a manifest**.
2. Select your workspace and paste the contents of [`slack-app-manifest.json`](slack-app-manifest.json). The manifest requests every user scope listed above. If you only need to send messages, you can trim it to `chat:write`.
3. Under **OAuth & Permissions**, click **Install to Workspace** and approve.
4. Copy the **User OAuth Token** (starts with `xoxp-`).

> **User or bot token?** A User OAuth Token (`xoxp-`) acts as your own account and is required for search and for reading channel threads. A Bot User OAuth Token (`xoxb-`) acts as the app's bot user. Either way, Slack decides the sender name and any app labels it shows; SlackMCP cannot change these.

### 2. Store the token

```sh
cp .env.example .env
chmod 600 .env
```

Edit `.env`:

```dotenv
SLACK_TOKEN=xoxp-your-token-here
```

SlackMCP loads the `.env` file next to `package.json`, whatever directory your client starts it from. A `SLACK_TOKEN` already set in the process environment takes precedence. Never commit `.env` or paste your token into a chat.

### 3. Register the server with your MCP client

**Codex.** Add the following to `~/.codex/config.toml` (template: [`config/codex.toml.example`](config/codex.toml.example)):

```toml
[mcp_servers.slack_local]
command = "node"
args = ["/absolute/path/to/SlackMCP/src/index.js"]
```

**Claude Desktop, Cursor, and other JSON-configured clients.** Merge the following into the client's `mcpServers` object (template: [`config/mcp.json.example`](config/mcp.json.example)):

```json
{
  "mcpServers": {
    "slack-local": {
      "command": "node",
      "args": ["/absolute/path/to/SlackMCP/src/index.js"]
    }
  }
}
```

If your client can't find `node`, replace it with the full path printed by `command -v node`.

### 4. Verify

Restart or reload your MCP client, then ask your assistant to run `slack_auth_test`. It should report your workspace and Slack user. If another Slack integration is also installed, tell your assistant to use `slack-local` for messaging.

## Usage

Once connected, ask your assistant in plain language:

- *"Summarise what I missed in #engineering today."*
- *"Find the thread where we discussed the Q3 launch date."*
- *"Reply in that thread: 'Confirmed for the 14th, I'll update the tracker.'"*
- *"DM Priya the link to that message."*

### Formatting

Messages use Slack's [mrkdwn](https://docs.slack.dev/messaging/formatting-message-text/) syntax (`*bold*`, `_italic_`, `<https://example.com|label>`), not standard Markdown. Set `mrkdwn: false` on `slack_send_message` to send plain text. Link and media previews (unfurls) are off by default and can be turned on per message. Messages can be up to 40,000 characters.

### Addressing conversations

Send and edit tools take a **conversation ID** (starting with `C`, `G`, or `D`), not a user ID. To message a person, call `slack_open_dm` first to get their DM conversation ID. Message timestamps (`ts`) are passed as strings.

### User names

`slack_read_channel`, `slack_read_thread`, and `slack_search_messages` replace user IDs with names:

- `<@U…>` mentions in message text become `@Name`
- each message gets a `user_name` field
- a top-level `user_names` map keeps the original IDs, so your assistant can still write `<@ID>` mentions when replying

Names are fetched with `users.info` and cached for as long as the server runs. If a name can't be fetched, the ID is left as it is and the read still succeeds.

### Pagination

Read and list tools return one page at a time. To get the next page, pass `response_metadata.next_cursor` as `cursor`. Search pages through results with `page` and reports the total in `paging.pages`.

## Network and proxy configuration

On Node.js 24 or later, set `NODE_USE_ENV_PROXY=1` when launching to send requests through `HTTP_PROXY` / `HTTPS_PROXY`. Configure your MCP client to pass these variables on to the server (along with `NO_PROXY` and `NODE_EXTRA_CA_CERTS` if needed). Don't write proxy credentials into client config files.

## Security

- Your token is read once at startup from `.env` or the environment. Restart the server after changing it.
- Requests are sent only to `https://slack.com/api/`, and redirects are refused.
- Tokens and message bodies are never logged. Errors return only Slack's error code and, where relevant, the missing scopes.
- Writes are never retried automatically. If a send fails because of a network error, check the conversation before sending again.
- Search can return results from private channels and DMs your account can access. Grant only the scopes you need.

To report a vulnerability, please open a private security advisory on GitHub rather than a public issue.

## Development

```sh
npm start   # run the stdio server (waits for an MCP client)
npm test    # run the test suite
```

The test suite runs a real MCP client against the server over stdio, with Slack's responses mocked. It covers protocol negotiation for earlier and current MCP clients, exact message preservation, edit behaviour, pagination, input validation, user-name resolution, missing credentials, rate limiting, and failures where delivery is unknown. No real Slack messages are sent.

### Project structure

```
src/
  index.js    Entry point: loads .env and starts the stdio transport
  server.js   Registers the MCP tools and handles errors
  tools.js    Tool definitions, input schemas, and Slack method mapping
  slack.js    Slack Web API client
  users.js    User ID → display name resolution with caching
test/         Node test runner suites and a stdio test fixture
config/       Sample client configurations
```

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| `Unable to start Slack MCP` | `SLACK_TOKEN` is missing. Check `.env` or your client's environment settings. |
| `Slack API error: missing_scope` | The error lists the scopes needed. Add them in the Slack app settings and reinstall the app. |
| `Slack API error: not_in_channel` | The account is not a member of that channel. Join it first. |
| `Slack API error: channel_not_found` | Check the conversation ID. To message a person, call `slack_open_dm` to get their DM ID. |
| Search or thread reads fail with a bot token | These need a User OAuth Token (`xoxp-`). |
| Client reports `node` not found | Use the absolute path from `command -v node` in the client config. |

## References

- [Model Context Protocol](https://modelcontextprotocol.io/docs/develop/build-server)
- [Slack Web API methods](https://docs.slack.dev/reference/methods/)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp/)

## License

Released under the [MIT License](LICENSE).
