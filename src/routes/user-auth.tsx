import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Satellite, Loader2, Eye, EyeOff, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/user-auth")({
  ssr: false,
  component: UserAuthPage,
});

const USER_USERNAME = "SATVISION";
const USER_PASSWORD = "SATVISION";

export function recordLoginEvent(type: "admin" | "user", username: string) {
  try {
    const raw = localStorage.getItem("login_events");
    const events: { type: string; username: string; time: number }[] = raw ? JSON.parse(raw) : [];
    events.push({ type, username, time: Date.now() });
    localStorage.setItem("login_events", JSON.stringify(events.slice(-500)));
  } catch {}
}

function UserAuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (
      localStorage.getItem("user_session") === "true" ||
      localStorage.getItem("admin_session") === "true"
    ) {
      navigate({ to: "/dashboard" });
    }
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth-callback`,
        },
      });
      if (error) throw error;
      // Browser will redirect to Google — no further action needed here.
    } catch (err) {
      setError("Google sign-in failed. Please try again.");
      toast.error("Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      if (username.toUpperCase() === USER_USERNAME && password === USER_PASSWORD) {
        localStorage.setItem("user_session", "true");
        recordLoginEvent("user", username);
        navigate({ to: "/dashboard" });
      } else {
        setError("Invalid username or password.");
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ background: "var(--background)" }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-25 blur-[120px]"
        style={{ background: "var(--gradient-primary)" }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full opacity-10 blur-[100px]"
        style={{ background: "oklch(0.65 0.25 270)" }}
      />

      <div className="relative z-10 w-full max-w-sm">
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
            background: "oklch(from var(--card) l c h / 0.85)",
            borderColor: "var(--border)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Header */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "oklch(from var(--primary) l c h / 0.15)" }}
            >
              <User className="h-6 w-6" style={{ color: "var(--primary)" }} />
            </div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk" }}>
              Sign In
            </h1>
            <p className="text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
              Access SatVision AI workspace
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Google OAuth button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="mb-4 flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all hover:bg-white/5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
            )}
            Continue with Google
          </button>

          {/* Divider */}
          <div className="relative mb-4 flex items-center">
            <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
            <span className="mx-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
              or continue with username
            </span>
            <div className="flex-1 border-t" style={{ borderColor: "var(--border)" }} />
          </div>

          {/* Username / password form */}
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                Username
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                placeholder="Enter username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                disabled={loading || googleLoading}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors disabled:opacity-50"
                style={{
                  background: "var(--input)",
                  borderColor: error ? "var(--destructive)" : "var(--border)",
                  color: "var(--foreground)",
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  disabled={loading || googleLoading}
                  className="w-full rounded-xl border px-4 py-3 pr-10 text-sm outline-none transition-colors disabled:opacity-50"
                  style={{
                    background: "var(--input)",
                    borderColor: error ? "var(--destructive)" : "var(--border)",
                    color: "var(--foreground)",
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </button>
          </form>

          <div className="mt-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
            Demo credentials:{" "}
            <span className="font-mono font-semibold">SATVISION / SATVISION</span>
          </div>
        </div>

        <p className="mt-5 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          <Link to="/" className="underline underline-offset-2 hover:opacity-80">← Back to home</Link>
          {" · "}
          <Link to="/auth" className="underline underline-offset-2 hover:opacity-80">Admin login</Link>
        </p>
      </div>
    </div>
  );
}
