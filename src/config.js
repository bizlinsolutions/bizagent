/**
 * Configuration for the bizagent CLI dashboard.
 *
 * Settings are persisted to a JSON file on disk so they survive restarts and
 * can be edited from the interactive dashboard. Environment variables still
 * work and take precedence over the persisted file (so `.env` / shell exports
 * win), which keeps the existing CLI behavior intact.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const DEFAULTS = {
  apiKey: "",
  model: "gpt-4o-mini",
  apiBase: "https://api.openai.com/v1",
  system: "You are bizagent, a helpful, concise assistant.",
};

function dataDir() {
  if (process.env.BIZAGENT_DATA_DIR) return process.env.BIZAGENT_DATA_DIR;
  return join(homedir(), ".bizagent");
}

function configPath() {
  return join(dataDir(), "config.json");
}

function readRaw() {
  try {
    if (!existsSync(configPath())) return {};
    const raw = readFileSync(configPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeRaw(obj) {
  mkdirSync(dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(obj, null, 2));
}

/**
 * Resolve the effective config. Env vars override the persisted file, which
 * overrides the built-in defaults.
 */
export function getConfig() {
  const file = readRaw();
  const env = process.env;
  const pick = (key, fileKey, fallback) => {
    const v = env[key];
    if (v && v.length > 0) return v;
    if (file[fileKey] != null && String(file[fileKey]).length > 0)
      return file[fileKey];
    return fallback;
  };
  return {
    apiKey: pick("BIZAGENT_API_KEY", "apiKey", DEFAULTS.apiKey),
    model: pick("BIZAGENT_MODEL", "model", DEFAULTS.model),
    apiBase: pick("BIZAGENT_API_BASE", "apiBase", DEFAULTS.apiBase),
    system: file.system || DEFAULTS.system,
  };
}

/**
 * Persist a partial config update. Env-controlled keys (apiKey/model/apiBase)
 * are saved to the file, but env vars will still shadow the file at read time.
 */
export function updateConfig(patch = {}) {
  const file = readRaw();
  const next = { ...file };
  for (const key of Object.keys(DEFAULTS)) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  writeRaw(next);
  return getConfig();
}

/**
 * Whether a given key is currently being overridden by an environment variable.
 */
export function envOverrides() {
  const env = process.env;
  return {
    apiKey: Boolean(env.BIZAGENT_API_KEY),
    model: Boolean(env.BIZAGENT_MODEL),
    apiBase: Boolean(env.BIZAGENT_API_BASE),
    system: false,
  };
}

export function configFilePath() {
  return configPath();
}

export function dataDirPath() {
  return dataDir();
}
