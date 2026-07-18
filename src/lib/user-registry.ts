// ─── User Registry ─────────────────────────────────────────────────────────────
// Stores Puter-authenticated users, their IP addresses, and the block list.
// Everything persisted in localStorage — no backend required.

export interface UserRecord {
  username:         string;
  uuid:             string;
  email?:           string;
  email_confirmed?: boolean;
  is_temp_user?:    boolean;
  // captured at each login
  ip:               string;
  country?:         string;
  city?:            string;
  region?:          string;
  org?:             string;          // ISP / org name
  // activity
  firstSeen:        number;          // epoch ms
  lastSeen:         number;
  loginCount:       number;
  // status
  blocked:          boolean;
  blockedAt?:       number;
  blockedReason?:   string;
}

const REGISTRY_KEY = "satvision_puter_users";
const BLOCKED_KEY  = "satvision_blocked";

// ── Read / write ───────────────────────────────────────────────────────────────
export function loadRegistry(): Record<string, UserRecord> {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveRegistry(reg: Record<string, UserRecord>): void {
  try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg)); } catch {}
}

// ── IP geo-lookup ──────────────────────────────────────────────────────────────
export async function fetchGeoIP(): Promise<{
  ip: string; country?: string; city?: string; region?: string; org?: string;
}> {
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("geo fail");
    const d = await res.json();
    return {
      ip:      d.ip      ?? "unknown",
      country: d.country_name,
      city:    d.city,
      region:  d.region,
      org:     d.org,
    };
  } catch {
    // Fallback: plain IP only
    try {
      const r2 = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
      const d2 = await r2.json();
      return { ip: d2.ip ?? "unknown" };
    } catch {
      return { ip: "unavailable" };
    }
  }
}

// ── Upsert user on login ───────────────────────────────────────────────────────
export function upsertUser(
  puter: { username: string; uuid: string; email?: string; email_confirmed?: boolean; is_temp_user?: boolean },
  geo:   { ip: string; country?: string; city?: string; region?: string; org?: string },
): UserRecord {
  const reg = loadRegistry();
  const key = puter.uuid;
  const now = Date.now();
  const existing = reg[key];

  const record: UserRecord = {
    username:         puter.username,
    uuid:             puter.uuid,
    email:            puter.email,
    email_confirmed:  puter.email_confirmed,
    is_temp_user:     puter.is_temp_user,
    ip:               geo.ip,
    country:          geo.country,
    city:             geo.city,
    region:           geo.region,
    org:              geo.org,
    firstSeen:        existing?.firstSeen ?? now,
    lastSeen:         now,
    loginCount:       (existing?.loginCount ?? 0) + 1,
    blocked:          existing?.blocked ?? false,
    blockedAt:        existing?.blockedAt,
    blockedReason:    existing?.blockedReason,
  };

  reg[key] = record;
  saveRegistry(reg);
  return record;
}

// ── Block / unblock ────────────────────────────────────────────────────────────
export function blockUser(uuid: string, reason?: string): void {
  const reg = loadRegistry();
  if (reg[uuid]) {
    reg[uuid].blocked = true;
    reg[uuid].blockedAt = Date.now();
    reg[uuid].blockedReason = reason ?? "Blocked by admin";
    saveRegistry(reg);
  }
  // Also persist UUID in the simple blocked set for fast login check
  const set = getBlockedSet();
  set.add(uuid);
  saveBlockedSet(set);
}

export function unblockUser(uuid: string): void {
  const reg = loadRegistry();
  if (reg[uuid]) {
    reg[uuid].blocked = false;
    reg[uuid].blockedAt = undefined;
    reg[uuid].blockedReason = undefined;
    saveRegistry(reg);
  }
  const set = getBlockedSet();
  set.delete(uuid);
  saveBlockedSet(set);
}

export function isUserBlocked(uuid: string): boolean {
  return getBlockedSet().has(uuid);
}

function getBlockedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(BLOCKED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveBlockedSet(s: Set<string>): void {
  try { localStorage.setItem(BLOCKED_KEY, JSON.stringify([...s])); } catch {}
}

// ── List all users ─────────────────────────────────────────────────────────────
export function listUsers(): UserRecord[] {
  return Object.values(loadRegistry()).sort((a, b) => b.lastSeen - a.lastSeen);
}
