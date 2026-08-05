/**
 * Core agent logic.
 *
 * The agent keeps a running conversation and produces a reply for each turn.
 * When an API key is available (BIZAGENT_API_KEY), it calls an OpenAI-compatible
 * chat completions endpoint. Otherwise it falls back to a deterministic local
 * responder so the CLI remains usable as a skeleton without any secrets.
 */

const DEFAULT_SYSTEM =
  "You are bizagent, a helpful, concise command-line assistant.";

function env(key, fallback) {
  const v = process.env[key];
  return v && v.length > 0 ? v : fallback;
}

export function createAgent(options = {}) {
  const apiKey = env("BIZAGENT_API_KEY", "");
  const model = options.model || env("BIZAGENT_MODEL", "gpt-4o-mini");
  const apiBase =
    options.apiBase || env("BIZAGENT_API_BASE", "https://api.openai.com/v1");
  const system = options.system || DEFAULT_SYSTEM;

  const messages = [{ role: "system", content: system }];

  async function callApi(userText) {
    messages.push({ role: "user", content: userText });
    const url = `${apiBase.replace(/\/$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content ?? "(no response)";
    messages.push({ role: "assistant", content: reply });
    return reply;
  }

  function localReply(userText) {
    const t = userText.trim();
    if (!t) return "(empty input)";
    if (/^(hi|hello|hey)\b/i.test(t)) return "Hello! I'm bizagent. How can I help?";
    if (/help/i.test(t))
      return "No API key configured. Set BIZAGENT_API_KEY to enable LLM replies. Try: bizagent --help";
    if (/time/i.test(t)) return `Current time: ${new Date().toISOString()}`;
    if (/echo\s+/i.test(t)) return t.replace(/^echo\s+/i, "");
    return `You said: "${t}"\n(Set BIZAGENT_API_KEY to enable real model replies.)`;
  }

  return {
    model,
    hasApiKey: Boolean(apiKey),
    history: messages,

    async run(userText) {
      if (apiKey) {
        try {
          return await callApi(userText);
        } catch (err) {
          return `[bizagent] API call failed: ${err.message}`;
        }
      }
      const reply = localReply(userText);
      messages.push(
        { role: "user", content: userText },
        { role: "assistant", content: reply },
      );
      return reply;
    },

    reset() {
      messages.length = 0;
      messages.push({ role: "system", content: system });
    },
  };
}
