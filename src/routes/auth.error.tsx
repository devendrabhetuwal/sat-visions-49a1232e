import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Satellite, AlertTriangle, RefreshCw, Home, LifeBuoy } from "lucide-react";
import { useEffect, useState } from "react";

type ErrorSearch = {
  error?: string;
  error_code?: string;
  error_description?: string;
  provider?: string;
};

export const Route = createFileRoute("/auth/error")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): ErrorSearch => ({
    error: typeof s.error === "string" ? s.error : undefined,
    error_code: typeof s.error_code === "string" ? s.error_code : undefined,
    error_description: typeof s.error_description === "string" ? s.error_description : undefined,
    provider: typeof s.provider === "string" ? s.provider : undefined,
  }),
  component: AuthErrorPage,
});

type Diagnosis = {
  title: string;
  message: string;
  suggestions: string[];
};

function diagnose({ error, error_code, error_description, provider }: ErrorSearch): Diagnosis {
  const raw = (error_description || error || "").toLowerCase();
  const code = (error_code || "").toLowerCase();
  const who = provider ? provider[0].toUpperCase() + provider.slice(1) : "the provider";

  if (raw.includes("access_denied") || code === "access_denied") {
    return {
      title: "Sign-in cancelled",
      message: `You cancelled the ${who} consent screen before finishing sign-in.`,
      suggestions: ["Click Try again and approve access when the provider prompts you."],
    };
  }
  if (raw.includes("redirect") || raw.includes("callback")) {
    return {
      title: "Redirect URL not allowed",
      message: "The redirect URL used for this sign-in isn't in the backend allow-list.",
      suggestions: [
        "Confirm this domain is added to the backend auth redirect URLs.",
        "If you deploy on multiple domains, add each one explicitly.",
      ],
    };
  }
  if (raw.includes("expired") || raw.includes("otp")) {
    return {
      title: "Link expired",
      message: "The magic link or confirmation code is no longer valid.",
      suggestions: ["Request a new link from the sign-in page."],
    };
  }
  if (raw.includes("unsupported provider") || raw.includes("provider is not enabled")) {
    return {
      title: `${who} sign-in isn't enabled`,
      message: `${who} is not configured in the backend auth providers yet.`,
      suggestions: ["Enable the provider in the backend settings, then try again."],
    };
  }
  if (raw.includes("invalid") && raw.includes("credentials")) {
    return {
      title: "Invalid credentials",
      message: "The email or password you entered doesn't match an account.",
      suggestions: ["Double-check your email and password.", "Use social sign-in if you signed up that way."],
    };
  }
  if (raw.includes("network") || raw.includes("failed to fetch")) {
    return {
      title: "Network problem",
      message: "We couldn't reach the auth server.",
      suggestions: ["Check your internet connection and try again."],
    };
  }
  return {
    title: "Sign-in failed",
    message: error_description || error || "Something went wrong while signing you in.",
    suggestions: ["Try again. If it keeps failing, contact support with the details below."],
  };
}

function AuthErrorPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth/error" });
  const [retrying, setRetrying] = useState(false);

  // Also pick up hash-based errors (OAuth commonly returns them in the fragment).
  const [hashParams, setHashParams] = useState<ErrorSearch>({});
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setHashParams({
      error: h.get("error") ?? undefined,
      error_code: h.get("error_code") ?? undefined,
      error_description: h.get("error_description")?.replace(/\+/g, " ") ?? undefined,
      provider: h.get("provider") ?? undefined,
    });
  }, []);

  const merged: ErrorSearch = {
    error: search.error ?? hashParams.error,
    error_code: search.error_code ?? hashParams.error_code,
    error_description: search.error_description ?? hashParams.error_description,
    provider: search.provider ?? hashParams.provider,
  };
  const diagnosis = diagnose(merged);

  const handleRetry = () => {
    setRetrying(true);
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-3xl p-8">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg glow"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Satellite className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold" style={{ fontFamily: "Space Grotesk" }}>
            SatVision <span className="text-gradient">AI</span>
          </span>
        </Link>

        <div className="mb-4 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>

        <h1
          className="mb-2 text-center text-2xl font-bold"
          style={{ fontFamily: "Space Grotesk" }}
        >
          {diagnosis.title}
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">{diagnosis.message}</p>

        {diagnosis.suggestions.length > 0 && (
          <ul className="mb-6 space-y-2 rounded-xl border border-border bg-input/40 p-4 text-sm text-muted-foreground">
            {diagnosis.suggestions.map((s) => (
              <li key={s} className="flex gap-2">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:glow disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
            Try signing in again
          </button>
          <Link
            to="/"
            className="glass flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all hover:bg-white/5"
          >
            <Home className="h-4 w-4" />
            Back to home
          </Link>
          <Link
            to="/contact"
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <LifeBuoy className="h-3.5 w-3.5" />
            Contact support
          </Link>
        </div>

        {(merged.error || merged.error_code || merged.error_description) && (
          <details className="mt-6 rounded-xl border border-border bg-background/40 p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-foreground">
              Technical details
            </summary>
            <dl className="mt-2 space-y-1 font-mono">
              {merged.provider && (
                <div><dt className="inline text-foreground">provider: </dt><dd className="inline">{merged.provider}</dd></div>
              )}
              {merged.error && (
                <div><dt className="inline text-foreground">error: </dt><dd className="inline">{merged.error}</dd></div>
              )}
              {merged.error_code && (
                <div><dt className="inline text-foreground">code: </dt><dd className="inline">{merged.error_code}</dd></div>
              )}
              {merged.error_description && (
                <div><dt className="inline text-foreground">description: </dt><dd className="inline break-words">{merged.error_description}</dd></div>
              )}
            </dl>
          </details>
        )}
      </div>
    </div>
  );
}