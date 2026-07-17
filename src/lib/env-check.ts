/**
 * Validates required environment variables at server startup.
 * Missing keys are logged as errors so issues surface immediately in logs
 * rather than silently failing at request time.
 */

const REQUIRED_KEYS = [
  { key: "GEMINI_API_KEY", feature: "Gemini AI chat & report generation" },
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_KEYS.filter(({ key }) => !process.env[key]);

  if (missing.length === 0) {
    console.log(
      "[env] ✓ All required environment variables are present:",
      REQUIRED_KEYS.map((k) => k.key).join(", "),
    );
    return;
  }

  for (const { key, feature } of missing) {
    console.error(
      `[env] ✗ Missing required environment variable: ${key} — ${feature} will not work.`,
    );
  }
}
