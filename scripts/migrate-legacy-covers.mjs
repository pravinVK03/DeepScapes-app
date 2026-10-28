import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const bucket = "deepscapes-covers";
const maxBytes = 1_000_000;

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

function legacyImage(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return undefined;
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length || bytes.byteLength > maxBytes) return undefined;
  const mime = match[1].toLowerCase();
  return { bytes, mime, extension: mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg" };
}

loadLocalEnv();
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");

const supabase = createClient(url, serviceRoleKey);
const { data: scapes, error } = await supabase.from("scapes").select("id,owner_id,payload").is("cover_path", null);
if (error) throw error;

let migrated = 0;
let skipped = 0;
let failed = 0;
for (const scape of scapes || []) {
  const payload = scape.payload && typeof scape.payload === "object" && !Array.isArray(scape.payload) ? scape.payload : undefined;
  const image = typeof payload?.cover === "string" ? legacyImage(payload.cover) : undefined;
  if (!payload || !image || !scape.owner_id) { skipped += 1; continue; }

  const fingerprint = createHash("sha256").update(image.bytes).digest("hex").slice(0, 24);
  const path = `${scape.owner_id}/${scape.id}/${fingerprint}.${image.extension}`;
  const upload = await supabase.storage.from(bucket).upload(path, image.bytes, { contentType: image.mime, upsert: true, cacheControl: "31536000" });
  if (upload.error) { failed += 1; continue; }

  const update = await supabase.from("scapes").update({ cover_path: path, cover_value: "#1d4ed8", payload: { ...payload, cover: "#1d4ed8" } }).eq("id", scape.id);
  if (update.error) { failed += 1; continue; }
  migrated += 1;
}

console.log(`Legacy thumbnail migration complete: ${migrated} migrated, ${skipped} skipped, ${failed} failed.`);
if (failed) process.exitCode = 1;
