import { z } from "zod";

const channel = z.string().regex(/^[CGD][A-Z0-9]+$/).describe("Slack conversation ID. Resolve the intended channel or DM before sending.");
const timestamp = z.string().regex(/^\d+\.\d+$/).describe("Slack message timestamp, kept as a string.");
const cursor = z.string().min(1).optional().describe("next_cursor from the previous page; omit for the first page.");
const limit = z.number().int().min(1).max(100).default(15);
const text = z.string().min(1).max(40000).describe("Exact message body. Use Slack mrkdwn (*bold*, _italic_) unless mrkdwn is false. Never append a signature or attribution.");

export const tools = [
  {
    name: "slack_auth_test",
    description: "Check the configured token and identify the connected Slack workspace and account.",
    method: "auth.test",
    readOnly: true,
    schema: z.object({}),
  },
  {
    name: "slack_list_conversations",
    description: "List visible Slack channels and DMs. Follow response_metadata.next_cursor for more pages.",
    method: "conversations.list",
    readOnly: true,
    schema: z.object({
      types: z.string().regex(/^(public_channel|private_channel|im|mpim)(,(public_channel|private_channel|im|mpim))*$/).default("public_channel,private_channel,im,mpim"),
      exclude_archived: z.boolean().default(true),
      limit,
      cursor,
    }),
  },
  {
    name: "slack_read_channel",
    description: "Read a page of channel or DM history, newest first. Requires access to the conversation. Follow next_cursor for more pages. User mentions in text are shown as @name; user_names maps user IDs to names (use <@ID> to mention someone when sending).",
    method: "conversations.history",
    readOnly: true,
    resolveUsers: true,
    schema: z.object({ channel, limit, cursor, oldest: timestamp.optional(), latest: timestamp.optional() }),
  },
  {
    name: "slack_read_thread",
    description: "Read a parent message and its thread replies. A user token is needed for public/private channel threads. Follow next_cursor for more pages. User mentions in text are shown as @name; user_names maps user IDs to names (use <@ID> to mention someone when sending).",
    method: "conversations.replies",
    readOnly: true,
    resolveUsers: true,
    schema: z.object({ channel, ts: timestamp.describe("Parent message timestamp."), limit, cursor }),
  },
  {
    name: "slack_list_users",
    description: "List workspace users to resolve user IDs. Follow response_metadata.next_cursor for more pages.",
    method: "users.list",
    readOnly: true,
    schema: z.object({ limit, cursor }),
  },
  {
    name: "slack_search_messages",
    description: "Search messages visible to the token, including private conversations it can access. Requires a user token with search:read. Use Slack search operators to limit the query. Follow paging.pages using page. User mentions in text are shown as @name; user_names maps user IDs to names (use <@ID> to mention someone when sending).",
    method: "search.messages",
    readOnly: true,
    resolveUsers: true,
    schema: z.object({
      query: z.string().min(1).max(4000),
      count: z.number().int().min(1).max(100).default(20),
      page: z.number().int().min(1).max(100).default(1),
      sort: z.enum(["score", "timestamp"]).default("timestamp"),
      sort_dir: z.enum(["asc", "desc"]).default("desc"),
      highlight: z.literal(false).default(false),
    }),
  },
  {
    name: "slack_send_message",
    description: "Send the exact supplied message body to an authorized Slack channel or DM, with no added signature, footer, blocks, or attribution metadata. Only send when the user authorized the content and destination. Do not retry blindly after an uncertain result.",
    method: "chat.postMessage",
    readOnly: false,
    schema: z.object({
      channel,
      text,
      thread_ts: timestamp.optional(),
      mrkdwn: z.boolean().default(true),
      parse: z.literal("none").default("none"),
      unfurl_links: z.boolean().default(false),
      unfurl_media: z.boolean().default(false),
      reply_broadcast: z.boolean().default(false),
    }).refine(value => !value.reply_broadcast || Boolean(value.thread_ts), {
      message: "reply_broadcast requires thread_ts",
    }),
  },
  {
    name: "slack_edit_message",
    description: "Replace an editable message with the exact supplied body. No signature or attribution is added. Only edit when authorized. Sending blocks:[] clears existing structured message blocks; Slack may retain an edited indicator.",
    method: "chat.update",
    readOnly: false,
    destructive: true,
    idempotent: true,
    schema: z.object({ channel, ts: timestamp, text, parse: z.literal("none").default("none") }),
    prepare: args => ({ ...args, blocks: [] }),
  },
  {
    name: "slack_open_dm",
    description: "Open or resume a direct message with explicitly authorized users. Returns a conversation ID for sending. Does not send a message.",
    method: "conversations.open",
    readOnly: false,
    idempotent: true,
    schema: z.object({
      users: z.array(z.string().regex(/^[UW][A-Z0-9]+$/)).min(1).max(8),
    }),
    prepare: args => ({ users: args.users.join(","), return_im: true }),
  },
  {
    name: "slack_get_permalink",
    description: "Get the Slack URL for a message using its channel and timestamp.",
    method: "chat.getPermalink",
    readOnly: true,
    schema: z.object({ channel, message_ts: timestamp }),
  },
  {
    name: "slack_add_reaction",
    description: "Add an authorized emoji reaction to a message. Use an emoji name without colons.",
    method: "reactions.add",
    readOnly: false,
    schema: z.object({ channel, timestamp, name: z.string().regex(/^[a-z0-9_+\-]+$/) }),
  },
];
