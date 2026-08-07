/**
 * Interactive terminal dashboard for bizagent, built with blessed.
 *
 * Tabs:
 *   1  Chat          — talk to the agent, messages persist to disk
 *   2  Conversations — browse / open / delete / rename past conversations
 *   3  Config        — view & edit API key, model, base URL, system prompt
 *   4  Metrics       — request stats, 14-day chart, recent log table
 *
 * Keys:
 *   1-4     jump to tab
 *   Tab     next tab
 *   Enter   activate / send (in chat)
 *   Esc     back / cancel input
 *   q / C-c quit
 */

import blessed from "blessed";
import { getConfig, updateConfig, envOverrides, configFilePath, dataDirPath } from "./config.js";
import { runChatTurn } from "./chat.js";
import * as convStore from "./conversations.js";
import { getMetrics, clearLogs } from "./logger.js";

const TABS = [
  { key: "1", label: "Chat" },
  { key: "2", label: "Conversations" },
  { key: "3", label: "Config" },
  { key: "4", label: "Metrics" },
];

export async function startTui() {
  const screen = blessed.screen({
    smartCSR: true,
    autoPadding: true,
    fullUnicode: true,
    title: "bizagent dashboard",
  });

  // ── State ────────────────────────────────────────────────────────────────
  let activeTab = 0;
  let cfg = getConfig();
  let chatMessages = [];
  let chatConvId = null;
  let sending = false;

  // ── Header ───────────────────────────────────────────────────────────────
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: { bg: "#1a2233", fg: "#e6ebf5" },
  });

  function renderHeader() {
    const mode = cfg.apiKey ? "{green-fg}● online{/}" : "{yellow-fg}● offline{/}";
    header.setContent(
      ` {bold}{cyan-fg}bizagent{/} dashboard` +
        `    ${mode}  {grey-fg}${cfg.model}{/}` +
        `    {grey-fg}↹ Tab/1-4 switch · q quit{/}`,
    );
  }

  // ── Tab bar ──────────────────────────────────────────────────────────────
  const tabBar = blessed.box({
    parent: screen,
    top: 1,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: { bg: "#121826" },
  });

  function renderTabs() {
    const parts = TABS.map((t, i) => {
      const active = i === activeTab;
      const text = `[${t.key}] ${t.label}`;
      return active ? `{bold}{cyan-fg}${text}{/}` : `{grey-fg}${text}{/}`;
    });
    tabBar.setContent(" " + parts.join("   "));
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: { bg: "#121826", fg: "#5c6781" },
  });

  function renderFooter(text) {
    footer.setContent(" " + (text || ""));
  }

  // ── Content container ────────────────────────────────────────────────────
  const content = blessed.box({
    parent: screen,
    top: 2,
    left: 0,
    right: 0,
    bottom: 1,
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CHAT VIEW
  // ══════════════════════════════════════════════════════════════════════════
  const chatView = blessed.box({ parent: content, width: "100%", height: "100%", hidden: true });

  const chatLog = blessed.log({
    parent: chatView,
    top: 0,
    left: 0,
    right: 0,
    bottom: 3,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: "│", style: { bg: "cyan" } },
    keys: true,
    mouse: true,
    style: { fg: "#e6ebf5" },
  });

  const chatStatus = blessed.box({
    parent: chatView,
    bottom: 2,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: { fg: "#5c6781" },
  });

  const chatInput = blessed.textbox({
    parent: chatView,
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    border: { type: "line" },
    style: { border: { fg: "#232c40" }, fg: "#e6ebf5" },
    inputOnFocus: true,
    placeholder: "Type a message and press Enter… (Esc to unfocus)",
  });

  function renderChatStatus() {
    const conv = chatConvId ? chatConvId : "new";
    chatStatus.setContent(
      ` conversation: {grey-fg}${conv}{/}` +
        `  ·  ${chatMessages.length} messages` +
        `  ·  ${cfg.apiKey ? "online" : "offline"}` +
        (sending ? "  ·  {cyan-fg}sending…{/}" : ""),
    );
  }

  function refreshChatLog() {
    chatLog.setContent("");
    if (chatMessages.length === 0) {
      chatLog.log("{grey-fg}No messages yet. Type below to start a conversation.{/}");
      if (!cfg.apiKey) {
        chatLog.log("{grey-fg}(offline mode — set an API key in Config [tab 3] for real replies){/}");
      }
    } else {
      for (const m of chatMessages) {
        if (m.role === "user") {
          chatLog.log(`{cyan-fg}you>{/} ${m.content}`);
        } else if (m.role === "system") {
          chatLog.log(`{grey-fg}[system] ${m.content}{/}`);
        } else {
          const tag = m.error ? "{red-fg}agent>{/}" : "{yellow-fg}agent>{/}";
          chatLog.log(`${tag} ${m.content}`);
        }
      }
    }
    chatLog.scrollTo(chatLog.getScrollHeight());
    renderChatStatus();
  }

  async function sendChatMessage() {
    const text = chatInput.getValue().trim();
    if (!text || sending) return;
    chatInput.clearValue();
    chatInput.focus();
    sending = true;
    chatMessages = [...chatMessages, { role: "user", content: text }];
    refreshChatLog();
    screen.render();

    // Build history for the API call (exclude the just-added user msg, since
    // runChatTurn appends it itself).
    const history = chatMessages.slice(0, -1).filter((m) => m.role !== "system" || true);
    const result = await runChatTurn({ messages: history, user: text });

    // Persist
    if (!chatConvId) {
      const c = convStore.createConversation({ system: cfg.system });
      chatConvId = c.id;
    }
    convStore.appendTurn(chatConvId, { user: text, assistant: result.reply, system: cfg.system });

    chatMessages = [
      ...chatMessages,
      { role: "assistant", content: result.reply, error: result.status === "error" },
    ];
    sending = false;
    refreshChatLog();
    screen.render();
  }

  function newChat() {
    chatMessages = [];
    chatConvId = null;
    refreshChatLog();
    screen.render();
  }

  async function openConversation(id) {
    const c = convStore.getConversation(id);
    if (!c) return;
    chatConvId = c.id;
    chatMessages = c.messages.map((m) => ({ ...m }));
    refreshChatLog();
    switchTab(0);
    chatInput.focus();
    screen.render();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONVERSATIONS VIEW
  // ══════════════════════════════════════════════════════════════════════════
  const convView = blessed.box({ parent: content, width: "100%", height: "100%", hidden: true });

  const convList = blessed.list({
    parent: convView,
    top: 0,
    left: 0,
    width: "45%",
    height: "100%",
    border: { type: "line" },
    label: " Conversations ",
    keys: true,
    mouse: true,
    vi: true,
    style: {
      border: { fg: "#232c40" },
      selected: { bg: "#1a2233", fg: "#4f8cff" },
      item: { fg: "#8b97ad" },
    },
  });

  const convPreview = blessed.log({
    parent: convView,
    top: 0,
    left: "45%",
    right: 0,
    height: "100%",
    border: { type: "line" },
    label: " Preview ",
    tags: true,
    scrollable: true,
    keys: true,
    mouse: true,
    scrollbar: { ch: "│", style: { bg: "cyan" } },
    style: { border: { fg: "#232c40" }, fg: "#e6ebf5" },
  });

  let convItems = [];

  function refreshConvList() {
    convItems = convStore.listConversations();
    if (convItems.length === 0) {
      convList.setItems(["(no conversations yet)"]);
      convPreview.setContent("{grey-fg}No conversations yet.{/}\n{grey-fg}Start chatting in tab 1.{/}");
    } else {
      convList.setItems(
        convItems.map(
          (c) => `${c.title}  (${c.messageCount} msgs)`,
        ),
      );
      showConvPreview(0);
    }
    screen.render();
  }

  function showConvPreview(idx) {
    const item = convItems[idx];
    if (!item) {
      convPreview.setContent("{grey-fg}Select a conversation.{/}");
      return;
    }
    const c = convStore.getConversation(item.id);
    if (!c) {
      convPreview.setContent("{red-fg}Failed to load.{/}");
      return;
    }
    convPreview.setContent("");
    for (const m of c.messages) {
      if (m.role === "user") convPreview.log(`{cyan-fg}you>{/} ${m.content}`);
      else if (m.role === "system") convPreview.log(`{grey-fg}[system] ${m.content}{/}`);
      else convPreview.log(`{yellow-fg}agent>{/} ${m.content}`);
    }
    convPreview.setLabel(` Preview: ${c.title} `);
  }

  convList.on("select", (_item, idx) => {
    const c = convItems[idx];
    if (c) openConversation(c.id);
  });

  convList.on("select item", (_item, idx) => {
    showConvPreview(idx);
    screen.render();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIG VIEW
  // ══════════════════════════════════════════════════════════════════════════
  const cfgView = blessed.box({ parent: content, width: "100%", height: "100%", hidden: true });

  const cfgForm = blessed.form({
    parent: cfgView,
    top: 0,
    left: 0,
    right: 0,
    height: "90%",
    keys: true,
    autoNext: true,
  });

  const env = envOverrides();

  function labeledField(form, top, label, name, value, opts = {}) {
    blessed.text({
      parent: form,
      top,
      left: 0,
      content: label + (opts.envLocked ? " {yellow-fg}[env-locked]{/}" : ""),
      tags: true,
      style: { fg: "#8b97ad" },
    });
    const field = blessed.textbox({
      parent: form,
      top: top + 1,
      left: 0,
      width: "100%",
      height: 3,
      border: { type: "line" },
      style: { border: { fg: "#232c40" }, fg: "#e6ebf5" },
      inputOnFocus: true,
      name,
      value: String(value || ""),
      censor: opts.secret,
      disabled: opts.envLocked,
    });
    if (opts.envLocked) {
      field.style.border.fg = "#5c6781";
      field.style.fg = "#5c6781";
    }
    return field;
  }

  const apiKeyField = labeledField(cfgForm, 0, "API Key", "apiKey", cfg.apiKey, {
    secret: true,
    envLocked: env.apiKey,
  });
  const modelField = labeledField(cfgForm, 4, "Model", "model", cfg.model, {
    envLocked: env.model,
  });
  const apiBaseField = labeledField(cfgForm, 8, "API Base URL", "apiBase", cfg.apiBase, {
    envLocked: env.apiBase,
  });

  // System prompt — textarea-like (taller textbox)
  blessed.text({
    parent: cfgForm,
    top: 12,
    left: 0,
    content: "System Prompt",
    style: { fg: "#8b97ad" },
  });
  const systemField = blessed.textarea({
    parent: cfgForm,
    top: 13,
    left: 0,
    width: "100%",
    height: 5,
    border: { type: "line" },
    style: { border: { fg: "#232c40" }, fg: "#e6ebf5" },
    inputOnFocus: true,
    name: "system",
    value: cfg.system || "",
  });

  const cfgStatus = blessed.box({
    parent: cfgView,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    tags: true,
    style: { fg: "#5c6781" },
  });

  function renderCfgStatus() {
    cfgStatus.setContent(
      ` config file: {grey-fg}${configFilePath()}{/}\n` +
        ` data dir:    {grey-fg}${dataDirPath()}{/}\n` +
        ` {grey-fg}Tab to move between fields · Enter on Save to commit{/}`,
    );
  }

  const saveButton = blessed.button({
    parent: cfgForm,
    top: 19,
    left: 0,
    width: 12,
    height: 3,
    border: { type: "line" },
    content: " Save",
    style: { border: { fg: "#4f8cff" }, fg: "#4f8cff", focus: { bg: "#1a2233" } },
  });

  saveButton.on("press", () => {
    const patch = {
      apiKey: apiKeyField.getValue(),
      model: modelField.getValue(),
      apiBase: apiBaseField.getValue(),
      system: systemField.getValue(),
    };
    cfg = updateConfig(patch);
    renderHeader();
    screen.render();
    renderFooter("{green-fg}✓ Config saved.{/}  Changes apply to new requests.");
    screen.render();
    setTimeout(() => { renderFooter(""); screen.render(); }, 2500);
  });

  const newChatButton = blessed.button({
    parent: cfgForm,
    top: 19,
    left: 14,
    width: 14,
    height: 3,
    border: { type: "line" },
    content: " New Chat",
    style: { border: { fg: "#8b97ad" }, fg: "#8b97ad", focus: { bg: "#1a2233" } },
  });

  newChatButton.on("press", () => {
    newChat();
    switchTab(0);
  });

  renderCfgStatus();

  // ══════════════════════════════════════════════════════════════════════════
  // METRICS VIEW
  // ══════════════════════════════════════════════════════════════════════════
  const metricsView = blessed.box({ parent: content, width: "100%", height: "100%", hidden: true });

  const metricsStats = blessed.box({
    parent: metricsView,
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    tags: true,
    style: { fg: "#e6ebf5" },
  });

  const metricsChart = blessed.box({
    parent: metricsView,
    top: 5,
    left: 0,
    right: 0,
    height: 8,
    border: { type: "line" },
    label: " Requests per day (14d) ",
    tags: true,
    style: { border: { fg: "#232c40" }, fg: "#8b97ad" },
  });

  const metricsTable = blessed.table({
    parent: metricsView,
    top: 14,
    left: 0,
    right: 0,
    bottom: 0,
    border: { type: "line" },
    label: " Recent requests ",
    keys: true,
    mouse: true,
    vi: true,
    scrollable: true,
    alwaysScroll: false,
    scrollbar: { ch: "│", style: { bg: "cyan" } },
    style: {
      border: { fg: "#232c40" },
      header: { fg: "#5c6781", bold: true },
      cell: { fg: "#e6ebf5" },
    },
    columnWidth: [20, 8, 8, 16, 10, 6, 6],
  });

  function refreshMetrics() {
    const m = getMetrics();
    metricsStats.setContent(
      ` Total: {bold}${m.total}{/}   ` +
        `OK: {green-fg}${m.ok}{/}   ` +
        `Errors: {red-fg}${m.errors}{/}   ` +
        `Online: ${m.online}   Offline: ${m.offline}\n` +
        ` Avg latency: {bold}${m.avgLatency}{/}ms   ` +
        `P95: ${m.p95Latency}ms   ` +
        `Error rate: ${m.total ? ((m.errors / m.total) * 100).toFixed(1) : 0}%`,
    );

    // Simple text bar chart
    const max = Math.max(1, ...m.byDay.map((d) => d.count));
    const barWidth = Math.floor((process.stdout.columns - 4) / 14);
    const bars = m.byDay
      .map((d) => {
        const h = Math.round((d.count / max) * 6);
        const block = "█".repeat(Math.max(1, h));
        return `{cyan-fg}${block.padEnd(7, " ")}{/}{grey-fg}${String(d.count).padStart(3)}{/}`;
      })
      .join("  ");
    const days = m.byDay.map((d) => d.day.slice(5)).join("    ");
    metricsChart.setContent(`\n  ${bars}\n  {grey-fg}${days}{/}`);

    const rows = [["Time", "Status", "Mode", "Model", "Latency", "In", "Out"]];
    for (const e of m.recent) {
      rows.push([
        e.ts ? new Date(e.ts).toLocaleTimeString() : "—",
        e.status === "ok" ? "ok" : "ERR",
        e.mode || "—",
        (e.model || "—").slice(0, 14),
        e.durationMs != null ? `${e.durationMs}ms` : "—",
        e.userChars != null ? String(e.userChars) : "—",
        e.replyChars != null ? String(e.replyChars) : "—",
      ]);
    }
    metricsTable.setData(rows);
    screen.render();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TAB SWITCHING
  // ══════════════════════════════════════════════════════════════════════════
  const views = [chatView, convView, cfgView, metricsView];

  function switchTab(idx) {
    if (idx < 0 || idx >= views.length) return;
    activeTab = idx;
    for (let i = 0; i < views.length; i++) {
      views[i].hidden = i !== idx;
    }
    renderTabs();
    renderFooter();

    if (idx === 0) {
      renderFooter(" Enter to type a message · Enter to send · Esc to unfocus · Ctrl+N new chat");
      chatInput.focus();
    } else if (idx === 1) {
      renderFooter(" ↑↓ navigate · Enter to open in chat · d to delete · r to rename");
      refreshConvList();
      convList.focus();
    } else if (idx === 2) {
      renderFooter(" Tab between fields · Enter on Save to commit · Esc to unfocus");
      cfgForm.focusFirst();
    } else if (idx === 3) {
      renderFooter(" ↑↓ scroll table · c to clear logs · r to refresh");
      refreshMetrics();
      metricsTable.focus();
    }
    screen.render();
  }

  // ── Global key handling ──────────────────────────────────────────────────
  screen.key(["q", "C-c"], () => process.exit(0));
  screen.key(["1"], () => switchTab(0));
  screen.key(["2"], () => switchTab(1));
  screen.key(["3"], () => switchTab(2));
  screen.key(["4"], () => switchTab(3));
  screen.key(["tab"], () => switchTab((activeTab + 1) % TABS.length));

  // Chat-specific keys
  chatInput.key("enter", sendChatMessage);
  chatInput.key("C-n", newChat);
  screen.key(["C-n"], () => {
    if (activeTab === 0) newChat();
  });

  // Conversations-specific keys
  convList.key("d", () => {
    const idx = convList.selected;
    const c = convItems[idx];
    if (!c) return;
    // Simple confirm via footer
    renderFooter(`{red-fg}Delete "${c.title}"? Press y to confirm, n to cancel.{/}`);
    screen.render();
    const handler = (ch, key) => {
      if (key.name === "y") {
        convStore.deleteConversation(c.id);
        refreshConvList();
        renderFooter(" Deleted.");
        screen.render();
        setTimeout(() => { renderFooter(" ↑↓ navigate · Enter to open · d to delete · r to rename"); screen.render(); }, 1500);
      } else {
        renderFooter(" ↑↓ navigate · Enter to open · d to delete · r to rename");
        screen.render();
      }
      screen.offKey("y", handler);
      screen.offKey("n", handler);
    };
    screen.key(["y", "n"], handler);
  });

  convList.key("r", () => {
    const idx = convList.selected;
    const c = convItems[idx];
    if (!c) return;
    // Inline rename via a prompt
    const prompt = blessed.prompt({
      parent: screen,
      border: { type: "line" },
      height: 5,
      width: "60%",
      top: "center",
      left: "center",
      label: " Rename conversation ",
      tags: true,
      style: { border: { fg: "#4f8cff" }, fg: "#e6ebf5" },
    });
    prompt.input("New title:", c.title, (err, val) => {
      if (val != null && val.trim()) {
        convStore.renameConversation(c.id, val.trim());
        refreshConvList();
      }
      prompt.destroy();
      screen.render();
    });
  });

  convList.key("r", () => {}); // prevent double-trigger

  // Metrics-specific keys
  metricsTable.key("c", () => {
    clearLogs();
    refreshMetrics();
    renderFooter("{green-fg}Logs cleared.{/}");
    screen.render();
    setTimeout(() => { renderFooter(" ↑↓ scroll table · c to clear logs · r to refresh"); screen.render(); }, 1500);
  });
  metricsTable.key("r", refreshMetrics);

  // ── Initial render ───────────────────────────────────────────────────────
  renderHeader();
  renderTabs();
  refreshChatLog();
  switchTab(0);

  return new Promise((resolve) => {
    screen.on("destroy", resolve);
    process.on("exit", resolve);
  });
}
