import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Satellite, Loader2, Apple } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Surface OAuth errors returned in the URL (e.g. access_denied, redirect mismatch).
    // Route them to the dedicated /auth/error page for a clear message + retry.
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

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/dashboard" });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          // Land back on the public /auth route so the session hydrates
          // BEFORE the _authenticated gate runs (avoids losing hash tokens / 404).
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        toast.success("Account created — check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (error) {
      toast.error(error.message || "Google sign-in failed");
      setLoading(false);
      navigate({
        to: "/auth/error",
        search: {
          error: "oauth_start_failed",
          error_description: error.message || "Google sign-in failed",
          provider: "google",
        } as never,
      });
    }
  };

  const handleApple = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (error) {
      toast.error(error.message || "Apple sign-in failed");
      setLoading(false);
      navigate({
        to: "/auth/error",
        search: {
          error: "oauth_start_failed",
          error_description: error.message || "Apple sign-in failed",
          provider: "apple",
        } as never,
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass w-full max-w-md rounded-3xl p-8">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg glow" style={{ background: "var(--gradient-primary)" }}>
            <Satellite className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold" style={{ fontFamily: "Space Grotesk" }}>
            SatVision <span className="text-gradient">AI</span>
          </span>
        </Link>

        <h1 className="mb-1 text-center text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in to your workspace" : "Start analyzing satellite data in seconds"}
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="glass mb-4 flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <button
          type="button"
          onClick={handleApple}
          disabled={loading}
          className="glass mb-4 flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all hover:bg-white/5 disabled:opacity-50"
        >
          <Apple className="h-4 w-4" />
          Continue with Apple
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-primary-foreground transition-all hover:glow disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Don't have an account? Sign up" : "Already have one? Sign in"}
        </button>
      </div>
    </div>
  );
}
