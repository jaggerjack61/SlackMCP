const USER_ID = /^[UW][A-Z0-9]{2,}$/;
const MENTION = /<@([UW][A-Z0-9]{2,})(?:\|[^>]*)?>/g;
const ID_KEYS = new Set(["user", "user_id", "users", "reply_users", "inviter", "parent_user_id"]);

// Adds display names to Slack read responses. Lookups use users.info (users:read) and are cached
// for the life of the process. A failed lookup leaves that ID unchanged instead of failing the read.
export function createUserResolver(callSlack) {
  const cache = new Map();

  function lookup(id) {
    if (!cache.has(id)) {
      cache.set(id, callSlack("users.info", { user: id }).then(
        ({ user }) => user?.profile?.display_name || user?.real_name || user?.name || null,
        () => { cache.delete(id); return null; },
      ));
    }
    return cache.get(id);
  }

  return async function resolveUsers(data) {
    const ids = new Set();
    collect(data, "", ids);
    if (!ids.size) return data;
    const names = new Map();
    await Promise.all([...ids].map(async id => {
      const name = await lookup(id);
      if (name) names.set(id, name);
    }));
    if (!names.size) return data;
    return { ...rewrite(data, "", names), user_names: Object.fromEntries(names) };
  };
}

function collect(value, key, ids) {
  if (typeof value === "string") {
    if (ID_KEYS.has(key) && USER_ID.test(value)) ids.add(value);
    if (key === "text") for (const [, id] of value.matchAll(MENTION)) ids.add(id);
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item, key, ids);
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) collect(child, childKey, ids);
  }
}

function rewrite(value, key, names) {
  if (typeof value === "string") {
    return key === "text" ? value.replace(MENTION, (mention, id) => names.has(id) ? `@${names.get(id)}` : mention) : value;
  }
  if (Array.isArray(value)) return value.map(item => rewrite(item, key, names));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [childKey, child] of Object.entries(value)) out[childKey] = rewrite(child, childKey, names);
  if (typeof value.user === "string" && names.has(value.user)) out.user_name = names.get(value.user);
  if (value.type === "user" && names.has(value.user_id)) out.name = names.get(value.user_id);
  return out;
}
