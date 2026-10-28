import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1 || line.trimStart().startsWith("#")) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[name]) process.env[name] = value;
  }
}

const text = (value, fallback = "") => typeof value === "string" ? value : fallback;
const iso = (value) => /^\d{4}-\d{2}-\d{2}T/.test(text(value)) ? value : new Date().toISOString();

loadLocalEnv();
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: scapes, error } = await supabase.from("scapes").select("id,payload");
if (error) throw error;

let migrated = 0;
let skipped = 0;
let failed = 0;
for (const scape of scapes || []) {
  const browser = scape.payload && typeof scape.payload === "object" && !Array.isArray(scape.payload) ? scape.payload.browser : undefined;
  if (!browser || typeof browser !== "object") { skipped += 1; continue; }
  const { data: existing, error: stateError } = await supabase.from("scape_browser_state").select("scape_id").eq("scape_id", scape.id).maybeSingle();
  if (stateError) { failed += 1; continue; }
  const events = Array.isArray(browser.activity) ? browser.activity : [];
  if (existing) { skipped += 1; continue; }

  const state = await supabase.from("scape_browser_state").upsert({
    scape_id: scape.id,
    profile_id: text(browser.profileId) || null,
    // Old live URLs/session ids are expired snapshots. Preserve history below
    // without reopening a paid remote browser session.
    active_session_id: null,
    active_session_name: null,
    live_view_url: null,
    expires_at: null,
    last_target: text(browser.lastTarget) || null,
    last_url: text(browser.lastUrl) || null,
    updated_at: iso(browser.updatedAt),
  });
  if (state.error) { failed += 1; continue; }

  const uniqueEvents = new Map();
  for (const event of events) {
    const id = text(event?.id);
    if (!id || uniqueEvents.has(id)) continue;
    uniqueEvents.set(id, {
      id,
      scape_id: scape.id,
      session_id: text(event.sessionId) || null,
      type: text(event.type, "activity"),
      occurred_at: iso(event.time),
      url: text(event.url) || null,
      target: text(event.target) || null,
      detail: text(event.detail) || null,
    });
  }
  if (uniqueEvents.size) {
    const insert = await supabase.from("scape_browser_events").upsert([...uniqueEvents.values()], { onConflict: "scape_id,id", ignoreDuplicates: true });
    if (insert.error) { failed += 1; continue; }
  }
  migrated += 1;
}

console.log(`Legacy browser migration complete: ${migrated} migrated, ${skipped} skipped, ${failed} failed.`);
if (failed) process.exitCode = 1;
