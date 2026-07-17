import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Satellite, Loader2, Eye, EyeOff, User } from "lucide-react";

export const Route = createFileRoute("/user-auth")({
  ssr: false,
  component: UserAuthPage,
});

const USER_USERNAME = "SATVISION";
const USER_PASSWORD = "SATVISION";

function recordLoginEvent(type: "admin" | "user", username: string) {
  try {
    const raw = localStorage.getItem("login_events");
    const events: { type: string; username: string; time: number }[] = raw ? JSON.parse(raw) : [];
    events.push({ type, username, time: Date.now() });
    // Keep last 500 events
    localStorage.setItem("login_events", JSON.stringify(events.slice(-500)));
  } catch {}
}

export { recordLoginEvent };

function UserAuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (localStorage.getItem("user_session") === "true" || localStorage.getItem("admin_session") === "true") {
      navigate({ to: "/dashboard" });
    }
  }, [navigate]);

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
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-20 blur-[120px]"
        style={{ background: "var(--gradient-primary)" }}
      />

      <div className="relative z-10 w-full max-w-sm">
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

        <div
          className="rounded-2xl border p-8 shadow-2xl"
          style={{
            background: "oklch(from var(--card) l c h / 0.85)",
            borderColor: "var(--border)",
            backdropFilter: "blur(20px)",
          }}
        >
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

          {error && (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
              {error}
            </div>
          )}

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
                disabled={loading}
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
                  disabled={loading}
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
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </button>
          </form>

          <div className="mt-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
            Default credentials:{" "}
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
