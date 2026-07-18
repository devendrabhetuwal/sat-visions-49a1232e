// ─── Usage limit helpers ───────────────────────────────────────────────────────
// Free tier: 5 uses per feature. Pro users bypass all limits.
// Stored in localStorage under the key "satvision_usage".

export type FeatureKey = "ai_chat" | "research" | "data_lab";

const STORAGE_KEY = "satvision_usage";
const FREE_LIMIT  = 5;
const PRO_KEY     = "satvision_pro";

// ─── Pro status ────────────────────────────────────────────────────────────────
export function isPro(): boolean {
  try { return localStorage.getItem(PRO_KEY) === "true"; } catch { return false; }
}

export function activatePro(): void {
  try { localStorage.setItem(PRO_KEY, "true"); } catch {}
}

// ─── Usage counters ────────────────────────────────────────────────────────────
function loadUsage(): Record<FeatureKey, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { ai_chat: 0, research: 0, data_lab: 0 };
  } catch {
    return { ai_chat: 0, research: 0, data_lab: 0 };
  }
}

function saveUsage(usage: Record<FeatureKey, number>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(usage)); } catch {}
}

/** Returns how many times a feature has been used. */
export function getUsageCount(feature: FeatureKey): number {
  return loadUsage()[feature] ?? 0;
}

/** Returns how many free uses remain (0 = limit reached). */
export function getRemainingUses(feature: FeatureKey): number {
  if (isPro()) return Infinity;
  return Math.max(0, FREE_LIMIT - getUsageCount(feature));
}

/**
 * Call BEFORE running a gated action.
 * Returns true if allowed, false if limit reached.
 * When allowed, increments the counter immediately.
 */
export function consumeUse(feature: FeatureKey): boolean {
  if (isPro()) return true;
  const usage = loadUsage();
  if ((usage[feature] ?? 0) >= FREE_LIMIT) return false;
  usage[feature] = (usage[feature] ?? 0) + 1;
  saveUsage(usage);
  return true;
}

export const FREE_LIMIT_VALUE = FREE_LIMIT;
