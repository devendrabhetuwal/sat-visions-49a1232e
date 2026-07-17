import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Satellite, Loader2, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

// Safely get the supabase client — returns null if env vars are missing
// so the page never crashes into the error boundary.
async function getSupabase() {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    return supabase;
  } catch {
    return null;
  }
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    // Handle OAuth errors returned in the URL hash/query
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const search = new URLSearchParams(window.location.search);
    const err =
      hash.get("error") ||
      hash.get("error_description") ||
      search.get("error") ||
      search.get("error_description");

    if (err) {
      const params = new URLSearchParams();
      const forward = (k: string) => {
        const v = hash.get(k) || search.get(k);
        if (v) params.set(k, v.replace(/\+/g, " "));
      };
      forward("error");
      forward("error_code");
      forward("error_description");
      forward("provider");
      window.history.replaceState(null, "", `/auth/error?${params.toString()}`);
      navigate({ to: "/auth/error", search: Object.fromEntries(params) as never });
      return;
    }

    // Check for existing session
    getSupabase().then((sb) => {
      if (!sb) { setConfigError(true); return; }
      sb.auth.getSession().then(({ data }) => {
        if (data.session) navigate({ to: "/dashboard" });
      }).catch(() => setConfigError(true));

      const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
        if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
          navigate({ to: "/dashboard" });
        }
      });
      return () => sub.subscription.unsubscribe();
    });
  }, [navigate]);

  const handleGoogle = async () => {
    setLoading("google");
    try {
      const sb = await getSupabase();
      if (!sb) throw new Error("Auth service not configured");
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      toast.error(message);
      setLoading(null);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("email");
    try {
      const sb = await getSupabase();
      if (!sb) throw new Error("Auth service not configured");
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        toast.success("Account created — check your email to confirm.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      toast.error(message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ background: "var(--background)" }}
    >
      {/* Background glow blobs */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: "var(--gradient-primary)" }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full opacity-10 blur-[80px]"
        style={{ background: "var(--gradient-primary)" }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl shadow-lg"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Satellite className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk" }}>
            SatVision <span className="text-gradient">AI</span>
          </span>
        </Link>

        {/* Card */}
        <div
          className="rounded-2xl border p-8 shadow-2xl"
          style={{
            background: "oklch(from var(--card) l c h / 0.8)",
            borderColor: "var(--border)",
            backdropFilter: "blur(20px)",
          }}
        >
          <h1
            className="mb-1 text-center text-2xl font-bold tracking-tight"
            style={{ fontFamily: "Space Grotesk" }}
          >
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mb-7 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            {mode === "signin"
              ? "Sign in to your workspace"
              : "Start analyzing satellite data today"}
          </p>

          {/* Config error banner */}
          {configError && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Auth service is not configured. Make sure{" "}
                <code className="font-mono">VITE_SUPABASE_URL</code> and{" "}
                <code className="font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</code> are set and
                redeploy.
              </span>
            </div>
          )}

          {/* Google sign-in — primary CTA */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading !== null || configError}
            className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3.5 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "#fff",
              color: "#111",
              borderColor: "#e5e7eb",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          >
            {loading === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>or continue with email</span>
            <div className="h-px flex-1" style={{ background: "var(--border)" }} />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleEmail} className="space-y-3">
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--muted-foreground)" }}
              />
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading !== null || configError}
                className="w-full rounded-xl border py-3 pl-10 pr-4 text-sm outline-none transition-colors focus:ring-2 disabled:opacity-50"
                style={{
                  background: "var(--input)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--muted-foreground)" }}
              />
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading !== null || configError}
                className="w-full rounded-xl border py-3 pl-10 pr-10 text-sm outline-none transition-colors focus:ring-2 disabled:opacity-50"
                style={{
                  background: "var(--input)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading !== null || configError}
              className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading === "email" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === "signin" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </button>
          </form>

          {/* Toggle mode */}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 w-full text-center text-xs transition-colors hover:opacity-100"
            style={{ color: "var(--muted-foreground)" }}
          >
            {mode === "signin" ? (
              <>Don&apos;t have an account?{" "}<span className="font-semibold text-gradient">Sign up</span></>
            ) : (
              <>Already have one?{" "}<span className="font-semibold text-gradient">Sign in</span></>
            )}
          </button>
        </div>

        <p className="mt-5 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          By continuing you agree to our{" "}
          <a href="/docs" className="underline underline-offset-2 hover:opacity-80">Terms</a>{" "}
          and{" "}
          <a href="/docs" className="underline underline-offset-2 hover:opacity-80">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
