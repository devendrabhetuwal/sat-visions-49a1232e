import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Satellite, Loader2, Eye, EyeOff, ShieldCheck, User, Sparkles,
} from "lucide-react";
import { recordLoginEvent } from "./user-auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: LoginPage,
});

declare global {
  interface Window {
    puter: {
      auth: {
        isSignedIn: () => boolean;
        signIn:     () => Promise<void>;
        signOut:    () => Promise<void>;
        getUser:    () => Promise<PuterUser>;
      };
    };
  }
}

export interface PuterUser {
  username:        string;
  uuid:            string;
  email?:          string;
  email_confirmed?: boolean;
  is_temp_user?:   boolean;
  taskbar_items?:  unknown[];
  referral_code?:  string;
  [key: string]:   unknown;
}

const ADMIN_USERNAME = "1234";
const ADMIN_PASSWORD = "2065";
const USER_USERNAME  = "SATVISION";
const USER_PASSWORD  = "SATVISION";

type Tab = "user" | "admin";

function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab]               = useState<Tab>("user");
  const [username, setUsername]     = useState("");
  const [password, setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [puterLoading, setPuterLoading] = useState(false);
  const [error, setError]           = useState("");

  // If already logged in, skip straight to dashboard
  useEffect(() => {
    const hasSession =
      localStorage.getItem("user_session")  === "true" ||
      localStorage.getItem("admin_session") === "true" ||
      localStorage.getItem("puter_session") === "true";
    if (hasSession) navigate({ to: "/dashboard" });
  }, [navigate]);

  const switchTab = (next: Tab) => {
    setTab(next); setUsername(""); setPassword(""); setError(""); setShowPassword(false);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    setTimeout(() => {
      if (tab === "admin") {
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
          localStorage.setItem("admin_session", "true");
          recordLoginEvent("admin", "Admin");
          navigate({ to: "/dashboard" });
        } else { setError("Invalid admin credentials."); setLoading(false); }
      } else {
        if (username.toUpperCase() === USER_USERNAME && password === USER_PASSWORD) {
          localStorage.setItem("user_session", "true");
          recordLoginEvent("user", username);
          navigate({ to: "/dashboard" });
        } else { setError("Invalid username or password."); setLoading(false); }
      }
    }, 400);
  };

  const handlePuterLogin = async () => {
    if (typeof window.puter === "undefined") {
      setError("Puter is still loading — please wait a moment and try again.");
      return;
    }
    setPuterLoading(true); setError("");
    try {
      await window.puter.auth.signIn();
      const user = await window.puter.auth.getUser();
      localStorage.setItem("puter_session", "true");
      localStorage.setItem("puter_user", JSON.stringify(user));
      localStorage.setItem("user_session", "true");
      recordLoginEvent("user", user.username);
      navigate({ to: "/dashboard" });
    } catch (e) {
      setError("Puter sign-in was cancelled or failed.");
    } finally {
      setPuterLoading(false);
    }
  };

  const isAdmin = tab === "admin";

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4"
      style={{ background: "var(--background)" }}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: "var(--gradient-primary)" }} />
      <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 rounded-full opacity-10 blur-[100px]"
        style={{ background: "#a78bfa" }} />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl shadow-lg"
            style={{ background: "var(--gradient-primary)" }}>
            <Satellite className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk" }}>
            SatVision <span className="text-gradient">AI</span>
          </span>
        </Link>

        {/* Card */}
        <div className="rounded-2xl border p-8 shadow-2xl"
          style={{
            background: "oklch(from var(--card) l c h / 0.85)",
            borderColor: "var(--border)",
            backdropFilter: "blur(20px)",
          }}>

          {/* Tab switcher */}
          <div className="mb-6 flex overflow-hidden rounded-xl border border-border">
            {(["user", "admin"] as Tab[]).map((t) => (
              <button key={t} type="button" onClick={() => switchTab(t)}
                className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-all ${
                  tab === t ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                style={tab === t ? { background: "var(--gradient-primary)" } : {}}>
                {t === "user" ? <User className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {t === "user" ? "User" : "Admin"}
              </button>
            ))}
          </div>

          {/* Icon + title */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "oklch(from var(--primary) l c h / 0.15)" }}>
              {isAdmin
                ? <ShieldCheck className="h-6 w-6" style={{ color: "var(--primary)" }} />
                : <User        className="h-6 w-6" style={{ color: "var(--primary)" }} />}
            </div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: "Space Grotesk" }}>
              {isAdmin ? "Admin Login" : "Sign In"}
            </h1>
            <p className="text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
              {isAdmin ? "Restricted access — administrators only" : "Access SatVision AI workspace"}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {/* ── Puter login (user tab only) ───────────────────────────────── */}
          {!isAdmin && (
            <>
              <button
                type="button"
                onClick={handlePuterLogin}
                disabled={puterLoading}
                className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-primary/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: "var(--gradient-primary)" }}
              >
                {/* animated shimmer */}
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                {puterLoading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting to Puter…</>
                  : <><PuterIcon /> Continue with Puter</>}
              </button>

              {/* Puter benefits strip */}
              <div className="mt-2.5 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="text-green-400">✓</span> Free account</span>
                <span className="flex items-center gap-1"><span className="text-green-400">✓</span> Instant login</span>
                <span className="flex items-center gap-1"><span className="text-green-400">✓</span> No password needed</span>
              </div>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                <span className="text-[11px] text-muted-foreground">or sign in with credentials</span>
                <div className="h-px flex-1" style={{ background: "var(--border)" }} />
              </div>
            </>
          )}

          {/* Credentials form */}
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                Username
              </label>
              <input type="text" required autoComplete="username" placeholder="Enter username"
                value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }}
                disabled={loading}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
                style={{ background: "var(--input)", borderColor: error ? "var(--destructive)" : "var(--border)", color: "var(--foreground)" }} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                Password
              </label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} required autoComplete="current-password"
                  placeholder="Enter password" value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  disabled={loading}
                  className="w-full rounded-xl border px-4 py-3 pr-10 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
                  style={{ background: "var(--input)", borderColor: error ? "var(--destructive)" : "var(--border)", color: "var(--foreground)" }} />
                <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: isAdmin ? "linear-gradient(135deg,#dc2626,#9f1239)" : "var(--gradient-primary)" }}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Sign in as ${isAdmin ? "Admin" : "User"}`}
            </button>
          </form>

          {/* Hint */}
          {!isAdmin && (
            <div className="mt-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
              Legacy credentials:{" "}
              <span className="font-mono font-semibold">SATVISION / SATVISION</span>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          <Link to="/" className="underline underline-offset-2 hover:opacity-80">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}

// ─── Puter logo SVG ────────────────────────────────────────────────────────────
function PuterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="white" fillOpacity="0.15" />
      <path d="M8 10C8 8.895 8.895 8 10 8h6a6 6 0 0 1 0 12h-3v4a1 1 0 0 1-2 0V10Zm2 0v8h4a4 4 0 1 0 0-8h-4Z" fill="white"/>
    </svg>
  );
}
