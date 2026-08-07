/**
 * Bridge between the dashboard API layer and the core agent.
 *
 * Runs a single chat turn using the persisted server config (with env
 * overrides), a caller-supplied message history, and records the request in
 * the log file for the metrics view.
 */

import { createAgent } from "./agent.js";
import { getConfig } from "./config.js";
import { logRequest } from "./logger.js";

/**
 * Run one chat turn.
 * @param {object} opts
 * @param {Array<{role:string,content:string}>} opts.messages  full history including system
 * @param {string} opts.user  the new user message (also appended to history)
 * @returns {Promise<{reply:string, mode:string, status:string, durationMs:number, model:string, error?:string}>}
 */
export async function runChatTurn({ messages, user }) {
  const cfg = getConfig();
  const start = Date.now();

  // Build a fresh agent seeded with the provided history so each request is
  // stateless from the server's perspective (the dashboard owns the history).
  const agent = createAgent({
    apiKey: cfg.apiKey,
    model: cfg.model,
    apiBase: cfg.apiBase,
    system: null,
  });
  // Replace the default system message with the caller's history.
  agent.history.length = 0;
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (m && m.role && m.content != null) agent.history.push({ ...m });
    }
  }

  const mode = agent.hasApiKey ? "online" : "offline";

  try {
    const reply = await agent.run(user);
    const durationMs = Date.now() - start;
    logRequest({
      status: "ok",
      mode,
      model: cfg.model,
      durationMs,
      userChars: String(user).length,
      replyChars: String(reply).length,
    });
    return { reply, mode, status: "ok", durationMs, model: cfg.model };
  } catch (err) {
    const durationMs = Date.now() - start;
    logRequest({
      status: "error",
      mode,
      model: cfg.model,
      durationMs,
      error: String(err.message || err),
    });
    return {
      reply: `[bizagent] error: ${err.message || err}`,
      mode,
      status: "error",
      durationMs,
      model: cfg.model,
      error: String(err.message || err),
    };
  }
}
