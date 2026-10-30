export class SlackError extends Error {
  constructor(message) {
    super(message);
    this.name = "SlackError";
  }
}

// Slack ignores JSON bodies for some read methods, so these are sent form-encoded.
const FORM_ENCODED_METHODS = new Set(["search.messages", "users.info"]);

export function createSlackClient({ token, fetchImpl = fetch, timeoutMs = 30000 }) {
  if (typeof token !== "string" || !token.trim()) {
    throw new SlackError("Set SLACK_TOKEN in the project .env file or process environment.");
  }

  return async function callSlack(method, params = {}) {
    const formEncoded = FORM_ENCODED_METHODS.has(method);
    const body = formEncoded
      ? new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])).toString()
      : JSON.stringify(params);
    let response;
    try {
      response = await fetchImpl(`https://slack.com/api/${method}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          "Content-Type": formEncoded ? "application/x-www-form-urlencoded; charset=utf-8" : "application/json; charset=utf-8",
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch {
      throw new SlackError("Slack request failed or timed out. Delivery may be unknown for a write; check Slack before retrying.");
    }

    if (response.status === 429) {
      const rawDelay = response.headers.get("retry-after");
      const delay = rawDelay && /^\d+$/.test(rawDelay) ? Number(rawDelay) : null;
      throw new SlackError(`Slack rate limit reached.${delay === null ? "" : ` Retry after ${delay} seconds.`} The request was not retried automatically.`);
    }
    if (!response.ok) {
      throw new SlackError(`Slack returned HTTP ${response.status}. Delivery may be unknown for a write; check Slack before retrying.`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new SlackError("Slack returned an unreadable response. Delivery may be unknown for a write; check Slack before retrying.");
    }
    if (!data || typeof data !== "object" || typeof data.ok !== "boolean") {
      throw new SlackError("Slack returned an unexpected response. Check Slack before retrying a write.");
    }
    if (!data.ok) {
      const code = typeof data.error === "string" && /^[a-z0-9_]{1,80}$/.test(data.error)
        ? data.error : "unknown_error";
      const needed = typeof data.needed === "string" && /^[a-z0-9:,._-]{1,300}$/.test(data.needed)
        ? ` Required scopes: ${data.needed}.` : "";
      throw new SlackError(`Slack API error: ${code}.${needed}`);
    }
    return data;
  };
}
