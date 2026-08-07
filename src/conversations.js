/**
 * Conversation persistence for the bizagent dashboard.
 *
 * Each conversation is a JSON file under <dataDir>/conversations/<id>.json.
 * Files are written atomically enough for a local single-user dashboard.
 */

import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function dataDir() {
  return process.env.BIZAGENT_DATA_DIR || join(homedir(), ".bizagent");
}

function convDir() {
  return join(dataDir(), "conversations");
}

function safeId(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("invalid conversation id");
  return id;
}

function pathFor(id) {
  return join(convDir(), `${safeId(id)}.json`);
}

function newId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

/** Create a new conversation with an optional system message. */
export function createConversation({ system } = {}) {
  mkdirSync(convDir(), { recursive: true });
  const id = newId();
  const conv = {
    id,
    title: "New conversation",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: system ? [{ role: "system", content: system }] : [],
  };
  writeFileSync(pathFor(id), JSON.stringify(conv, null, 2));
  return conv;
}

/** Read a single conversation by id. Returns null if missing. */
export function getConversation(id) {
  try {
    const raw = readFileSync(pathFor(id), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** List all conversations, newest first, with light metadata only. */
export function listConversations() {
  if (!existsSync(convDir())) return [];
  const entries = readdirSync(convDir())
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const raw = readFileSync(join(convDir(), f), "utf8");
        const c = JSON.parse(raw);
        const st = statSync(join(convDir(), f));
        return {
          id: c.id,
          title: c.title,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          messageCount: Array.isArray(c.messages) ? c.messages.length : 0,
          size: st.size,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  entries.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return entries;
}

/** Derive a short title from the first user message. */
function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const t = String(firstUser.content).replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "..." : t || "New conversation";
}

/**
 * Append a user + assistant turn to a conversation (creating it if needed).
 * Returns the updated conversation.
 */
export function appendTurn(id, { user, assistant, system } = {}) {
  mkdirSync(convDir(), { recursive: true });
  let conv = id ? getConversation(id) : null;
  if (!conv) {
    conv = createConversation({ system });
  }
  if (system && !conv.messages.some((m) => m.role === "system")) {
    conv.messages.unshift({ role: "system", content: system });
  }
  if (user != null) conv.messages.push({ role: "user", content: user });
  if (assistant != null)
    conv.messages.push({ role: "assistant", content: assistant });
  conv.updatedAt = nowIso();
  if (
    conv.title === "New conversation" &&
    conv.messages.some((m) => m.role === "user")
  ) {
    conv.title = deriveTitle(conv.messages);
  }
  writeFileSync(pathFor(conv.id), JSON.stringify(conv, null, 2));
  return conv;
}

/** Rename a conversation. */
export function renameConversation(id, title) {
  const conv = getConversation(id);
  if (!conv) return null;
  conv.title = String(title || "Untitled").slice(0, 120);
  conv.updatedAt = nowIso();
  writeFileSync(pathFor(id), JSON.stringify(conv, null, 2));
  return conv;
}

/** Delete a conversation. Returns true if a file was removed. */
export function deleteConversation(id) {
  try {
    unlinkSync(pathFor(id));
    return true;
  } catch {
    return false;
  }
}

/** Clear all messages of a conversation but keep the file/id. */
export function resetConversation(id, system) {
  const conv = getConversation(id);
  if (!conv) return null;
  conv.messages = system ? [{ role: "system", content: system }] : [];
  conv.updatedAt = nowIso();
  conv.title = "New conversation";
  writeFileSync(pathFor(id), JSON.stringify(conv, null, 2));
  return conv;
}
