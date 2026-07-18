import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Shield, Users, FolderOpen, Share2, Trash2, ArrowLeft,
  Loader2, Satellite, ExternalLink, Activity, Globe,
  TrendingUp, AlertTriangle, Flame, Wind, Waves,
  RefreshCw, Clock, BarChart3, LayoutDashboard, ChevronRight,
  UserCircle2, LogIn, FlaskConical, Ban, CheckCircle2, Search,
  MapPin, Wifi, Hash, Mail, CalendarDays, X,
} from "lucide-react";
import { listUsers, blockUser, unblockUser, type UserRecord } from "@/lib/user-registry";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: () => {},
  component: AdminPage,
});

type Tab = "overview" | "logins" | "nasa" | "users" | "projects" | "shares";

// ─── Login event helpers ───────────────────────────────────────────────────────
interface LoginEvent {
  type: "admin" | "user";
  username: string;
  time: number;
}

function getLoginEvents(): LoginEvent[] {
  try {
    const raw = localStorage.getItem("login_events");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getTrafficData() {
  const events = getLoginEvents();
  const byDay: Record<string, number> = {};
  const now = Date.now();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    byDay[key] = 0;
  }
  for (const ev of events) {
    if (now - ev.time <= 7 * 86400000) {
      const key = new Date(ev.time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (key in byDay) byDay[key]++;
    }
  }
  return Object.entries(byDay).map(([date, logins]) => ({ date, logins }));
}

function getTrafficByUser() {
  const events = getLoginEvents();
  const byUser: Record<string, { count: number; type: "admin" | "user"; lastSeen: number }> = {};
  for (const ev of events) {
    if (!byUser[ev.username]) {
      byUser[ev.username] = { count: 0, type: ev.type, lastSeen: ev.time };
    }
    byUser[ev.username].count++;
    if (ev.time > byUser[ev.username].lastSeen) byUser[ev.username].lastSeen = ev.time;
  }
  return Object.entries(byUser)
    .map(([username, s]) => ({ username, ...s }))
    .sort((a, b) => b.count - a.count);
}

// ─── NASA EONET ───────────────────────────────────────────────────────────────
interface NasaEvent {
  id: string;
  title: string;
  categories: { title: string }[];
  sources: { id: string; url: string }[];
  geometry: { date: string }[];
}

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  "Wildfires": <Flame className="h-3.5 w-3.5 text-orange-400" />,
  "Severe Storms": <Wind className="h-3.5 w-3.5 text-blue-400" />,
  "Floods": <Waves className="h-3.5 w-3.5 text-cyan-400" />,
  "Volcanoes": <AlertTriangle className="h-3.5 w-3.5 text-red-400" />,
};

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function trySupabaseAdmin() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return null;
  }
}

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV_ITEMS: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "overview",  label: "Overview",   icon: <LayoutDashboard className="h-4 w-4" />, desc: "Stats & traffic" },
  { id: "logins",   label: "Login Log",  icon: <LogIn className="h-4 w-4" />,           desc: "All sessions" },
  { id: "nasa",     label: "NASA Events",icon: <Globe className="h-4 w-4" />,            desc: "Live EONET data" },
  { id: "users",    label: "Users",      icon: <Users className="h-4 w-4" />,            desc: "Supabase accounts" },
  { id: "projects", label: "Projects",   icon: <FolderOpen className="h-4 w-4" />,       desc: "GeoTIFF uploads" },
  { id: "shares",   label: "Shares",     icon: <Share2 className="h-4 w-4" />,           desc: "Public time-series" },
];

// ─── Admin page ───────────────────────────────────────────────────────────────
function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const current = NAV_ITEMS.find((n) => n.id === tab)!;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Top header ── */}
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg glow"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Satellite className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold" style={{ fontFamily: "Space Grotesk" }}>
              SatVision <span className="text-gradient">AI</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden sm:flex glass items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Shield className="h-3 w-3" /> Admin Console
            </span>
            <Link to="/data-lab" className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium hover:text-primary transition-colors">
              <FlaskConical className="h-3.5 w-3.5" /> Data Lab
            </Link>
            <Link to="/tec-lab" className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 hover:bg-primary/10 transition-colors">
              <Satellite className="h-3.5 w-3.5" /> TEC Lab
            </Link>
            <Link
              to="/dashboard"
              className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium hover:text-primary transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Exit
            </Link>
          </div>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 gap-0 px-4 py-6 sm:gap-6">

        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="glass sticky top-20 rounded-2xl border border-border/40 overflow-hidden">
            <div className="border-b border-border/30 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Navigation</p>
            </div>
            <nav className="p-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`group mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    tab === item.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                  }`}
                >
                  <span className={tab === item.id ? "text-primary" : ""}>{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{item.label}</p>
                    <p className="text-[10px] leading-tight opacity-60">{item.desc}</p>
                  </div>
                  {tab === item.id && (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Mobile tab bar */}
        <div className="mb-4 flex flex-wrap gap-1.5 lg:hidden w-full">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`glass flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                tab === item.id ? "border-primary/60 text-primary glow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <main className="min-w-0 flex-1">
          {/* Breadcrumb */}
          <div className="mb-5 flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: "oklch(from var(--primary) l c h / 0.12)" }}
            >
              <span className="text-primary">{current.icon}</span>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight" style={{ fontFamily: "Space Grotesk" }}>
                {current.label}
              </h1>
              <p className="text-xs text-muted-foreground">{current.desc}</p>
            </div>
          </div>

          {tab === "overview"  && <OverviewPanel />}
          {tab === "logins"   && <LoginLogPanel />}
          {tab === "nasa"     && <NasaPanel />}
          {tab === "users"    && <UsersPanel />}
          {tab === "projects" && <ProjectsPanel />}
          {tab === "shares"   && <SharesPanel />}
        </main>
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewPanel() {
  const events = getLoginEvents();
  const trafficData = getTrafficData();
  const userTraffic = getTrafficByUser();
  const totalLogins = events.length;
  const adminLogins = events.filter((e) => e.type === "admin").length;
  const userLogins = events.filter((e) => e.type === "user").length;
  const last24h = events.filter((e) => Date.now() - e.time < 86400000).length;

  const COLORS = ["#6ec6f5", "#a78bfa", "#34d399", "#f59e0b", "#f87171", "#60a5fa"];

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Logins"   value={totalLogins} icon={<TrendingUp className="h-4 w-4" />} color="primary" />
        <StatCard label="Last 24 Hours"  value={last24h}     icon={<Activity className="h-4 w-4" />}   color="green" />
        <StatCard label="User Sessions"  value={userLogins}  icon={<Users className="h-4 w-4" />}       color="blue" />
        <StatCard label="Admin Sessions" value={adminLogins} icon={<Shield className="h-4 w-4" />}      color="orange" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Traffic 7-day chart */}
        <div className="glass rounded-2xl border border-border/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Login Traffic — Last 7 Days</h2>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          {totalLogins === 0 ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
              No login events yet. Logins will appear after users sign in.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trafficData}>
                <defs>
                  <linearGradient id="grad7" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6ec6f5" />
                    <stop offset="100%" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="logins" fill="url(#grad7)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Traffic by username */}
        <div className="glass rounded-2xl border border-border/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Traffic by Username</h2>
            <UserCircle2 className="h-4 w-4 text-muted-foreground" />
          </div>
          {userTraffic.length === 0 ? (
            <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
              No login data yet.
            </div>
          ) : userTraffic.length <= 6 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={userTraffic} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis
                  type="category"
                  dataKey="username"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {userTraffic.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="max-h-[180px] overflow-y-auto space-y-1.5 pr-1">
              {userTraffic.map((u, i) => (
                <div key={u.username} className="flex items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-muted/10">
                  <span className="w-5 text-center text-[10px] font-bold text-muted-foreground">#{i + 1}</span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="flex-1 truncate text-xs font-medium">{u.username}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    u.type === "admin" ? "bg-primary/20 text-primary" : "bg-blue-500/20 text-blue-400"
                  }`}>{u.type}</span>
                  <span className="shrink-0 text-xs font-bold">{u.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Username detail table */}
      {userTraffic.length > 0 && (
        <div className="glass rounded-2xl border border-border/40 overflow-hidden">
          <div className="border-b border-border/30 px-5 py-3">
            <h2 className="text-sm font-semibold">User Login Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/10 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Username</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Total Logins</th>
                  <th className="px-5 py-3">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {userTraffic.map((u, i) => (
                  <tr key={u.username} className="border-t border-border/20 hover:bg-muted/10">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: COLORS[i % COLORS.length] }}
                        />
                        <span className="font-medium">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        u.type === "admin" ? "bg-primary/20 text-primary" : "bg-blue-500/20 text-blue-400"
                      }`}>{u.type}</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.max(20, (u.count / userTraffic[0].count) * 80)}px`,
                            background: COLORS[i % COLORS.length],
                            opacity: 0.7,
                          }}
                        />
                        <span className="font-bold">{u.count}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {new Date(u.lastSeen).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="glass rounded-2xl border border-border/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent Activity</h2>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="space-y-1.5">
            {[...events].reverse().slice(0, 10).map((ev, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl bg-muted/10 px-4 py-2.5 text-xs">
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    ev.type === "admin" ? "bg-primary/20 text-primary" : "bg-blue-500/20 text-blue-400"
                  }`}>{ev.type}</span>
                  <span className="font-medium">{ev.username}</span>
                  <span className="text-muted-foreground">signed in</span>
                </span>
                <span className="text-muted-foreground">{new Date(ev.time).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Login log ────────────────────────────────────────────────────────────────
function LoginLogPanel() {
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [filter, setFilter] = useState<"all" | "admin" | "user">("all");

  useEffect(() => { setEvents([...getLoginEvents()].reverse()); }, []);

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);

  const handleClear = () => {
    if (!confirm("Clear all login history? This cannot be undone.")) return;
    localStorage.removeItem("login_events");
    setEvents([]);
    toast.success("Login history cleared");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["all", "admin", "user"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === f ? "bg-primary/20 text-primary" : "glass text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={handleClear}
          className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear history
        </button>
      </div>

      <div className="glass overflow-hidden rounded-2xl border border-border/40">
        <table className="w-full text-sm">
          <thead className="border-b border-border/40 bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Username</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No login events recorded.</td></tr>
            )}
            {filtered.map((ev, i) => (
              <tr key={i} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    ev.type === "admin" ? "bg-primary/20 text-primary" : "bg-blue-500/20 text-blue-400"
                  }`}>{ev.type}</span>
                </td>
                <td className="px-5 py-3 font-medium">{ev.username}</td>
                <td className="px-5 py-3 text-muted-foreground">{new Date(ev.time).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-muted-foreground">{new Date(ev.time).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── NASA Events ──────────────────────────────────────────────────────────────
function NasaPanel() {
  const [events, setEvents] = useState<NasaEvent[]>([]);
  const [apod, setApod] = useState<{ url: string; title: string; explanation: string; date: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [eonetRes, apodRes] = await Promise.all([
        fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=30&days=30"),
        fetch("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY"),
      ]);
      const eonetJson = await eonetRes.json();
      const apodJson = await apodRes.json();
      setEvents(eonetJson.events ?? []);
      if (apodJson.url) setApod(apodJson);
    } catch {
      setError("Failed to fetch NASA data. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Fetching NASA data…</div>;
  if (error) return <div className="glass rounded-2xl border border-destructive/40 p-4 text-sm text-destructive">{error}</div>;

  const categoryCounts: Record<string, number> = {};
  for (const ev of events) {
    const cat = ev.categories[0]?.title ?? "Other";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }
  const categoryData = Object.entries(categoryCounts).map(([name, count]) => ({ name, count }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold" style={{ fontFamily: "Space Grotesk" }}>NASA Earth Observatory Natural Events</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Live via NASA EONET — {events.length} active events (last 30 days)</p>
        </div>
        <button onClick={fetchData} className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs hover:text-primary transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {categoryData.length > 0 && (
        <div className="glass rounded-2xl border border-border/40 p-5">
          <h3 className="mb-4 text-sm font-semibold">Events by Category</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={categoryData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={100} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="#6ec6f5" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {apod && apod.url?.match(/\.(jpg|jpeg|png|gif|webp)/i) && (
        <div className="glass overflow-hidden rounded-2xl border border-border/40">
          <img src={apod.url} alt={apod.title} className="h-48 w-full object-cover" />
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">NASA Astronomy Picture of the Day — {apod.date}</p>
                <h3 className="mt-0.5 font-semibold">{apod.title}</h3>
              </div>
              <a href="https://apod.nasa.gov" target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary hover:underline">
                NASA APOD ↗
              </a>
            </div>
            <p className="mt-2 text-xs text-muted-foreground line-clamp-3">{apod.explanation}</p>
          </div>
        </div>
      )}

      <div className="glass overflow-hidden rounded-2xl border border-border/40">
        <div className="border-b border-border/40 px-5 py-3">
          <h3 className="text-sm font-semibold">Active Natural Events</h3>
        </div>
        <div className="max-h-[500px] divide-y divide-border/20 overflow-y-auto">
          {events.map((ev) => {
            const cat = ev.categories[0]?.title ?? "Other";
            const latestDate = ev.geometry?.[ev.geometry.length - 1]?.date;
            return (
              <div key={ev.id} className="flex items-start justify-between px-5 py-3 hover:bg-muted/10 transition-colors">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 shrink-0">{CATEGORY_ICON[cat] ?? <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ev.title}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">{cat}</span>
                      {latestDate && <span className="text-[10px] text-muted-foreground">{new Date(latestDate).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
                {ev.sources[0]?.url && (
                  <a href={ev.sources[0].url} target="_blank" rel="noreferrer"
                    className="ml-3 flex shrink-0 items-center gap-1 rounded-md glass px-2 py-1 text-[10px] hover:text-primary transition-colors">
                    <ExternalLink className="h-3 w-3" /> Source
                  </a>
                )}
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">No active events found.</div>
          )}
        </div>
      </div>

      <div className="glass rounded-2xl border border-border/40 p-5">
        <h3 className="mb-3 text-sm font-semibold">Satellite Data Sources</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { name: "NASA EONET", desc: "Earth natural events (wildfires, storms, volcanoes)", url: "https://eonet.gsfc.nasa.gov" },
            { name: "NASA Earthdata", desc: "MODIS, VIIRS, Landsat imagery", url: "https://earthdata.nasa.gov" },
            { name: "NASA APOD", desc: "Astronomy picture of the day archive", url: "https://apod.nasa.gov" },
            { name: "Copernicus Hub", desc: "Sentinel-1/2/3/5P satellite data (ESA)", url: "https://scihub.copernicus.eu" },
            { name: "USGS EarthExplorer", desc: "Landsat, ASTER, aerial imagery", url: "https://earthexplorer.usgs.gov" },
            { name: "Google Earth Engine", desc: "Planetary-scale geospatial analysis", url: "https://earthengine.google.com" },
          ].map((src) => (
            <a key={src.name} href={src.url} target="_blank" rel="noreferrer"
              className="glass flex items-start gap-2 rounded-xl p-3 hover:bg-white/5 transition-colors">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{src.name} ↗</p>
                <p className="text-xs text-muted-foreground">{src.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Users panel ──────────────────────────────────────────────────────────────
function UsersPanel() {
  const [users, setUsers]           = useState<UserRecord[]>([]);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<"all" | "active" | "blocked">("all");
  const [selected, setSelected]     = useState<UserRecord | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null); // uuid pending block confirm

  const reload = () => setUsers(listUsers());
  useEffect(() => { reload(); }, []);

  const now = Date.now();
  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchQ = !q || u.username.toLowerCase().includes(q) || u.ip.includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) || (u.country ?? "").toLowerCase().includes(q);
    const matchF = filter === "all" || (filter === "blocked" ? u.blocked : !u.blocked);
    return matchQ && matchF;
  });

  const total   = users.length;
  const active  = users.filter((u) => !u.blocked).length;
  const blocked = users.filter((u) => u.blocked).length;
  const recent  = users.filter((u) => now - u.lastSeen < 86400000).length;

  const doBlock = (uuid: string) => {
    blockUser(uuid, blockReason || "Blocked by admin");
    setBlockReason("");
    setConfirming(null);
    setSelected(null);
    reload();
    toast.success("User blocked");
  };

  const doUnblock = (uuid: string) => {
    unblockUser(uuid);
    reload();
    toast.success("User unblocked");
  };

  return (
    <div className="space-y-5">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Users"  value={total}   icon={<Users className="h-4 w-4" />}         color="primary" />
        <StatCard label="Active"       value={active}  icon={<CheckCircle2 className="h-4 w-4" />}   color="green" />
        <StatCard label="Blocked"      value={blocked} icon={<Ban className="h-4 w-4" />}             color="orange" />
        <StatCard label="Last 24 h"    value={recent}  icon={<TrendingUp className="h-4 w-4" />}      color="blue" />
      </div>

      {/* Empty state — no Puter logins yet */}
      {total === 0 && (
        <div className="glass flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/40 py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground/30" />
          <p className="font-medium text-muted-foreground">No Puter users yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Users appear here automatically the first time they sign in via Puter.js.
            Their username, UUID, email, and IP address are captured at login.
          </p>
        </div>
      )}

      {total > 0 && (
        <>
          {/* Search + filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by username, email, IP, country…"
                className="w-full rounded-xl border border-border bg-input py-2 pl-9 pr-4 text-sm outline-none focus:border-primary"
                style={{ color: "var(--foreground)" }}
              />
            </div>
            {(["all", "active", "blocked"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-xl px-3 py-2 text-xs font-medium capitalize transition ${
                  filter === f ? "bg-primary/20 text-primary" : "glass text-muted-foreground hover:text-foreground"
                }`}>
                {f}
              </button>
            ))}
            <button onClick={reload} className="glass rounded-xl p-2 text-muted-foreground hover:text-primary transition">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Table */}
          <div className="glass overflow-hidden rounded-2xl border border-border/40">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/40 bg-muted/20 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">UUID</th>
                    <th className="px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Logins</th>
                    <th className="px-4 py-3">Last seen</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr
                      key={u.uuid}
                      onClick={() => setSelected(u)}
                      className={`cursor-pointer border-b border-border/20 transition-colors hover:bg-muted/10 ${u.blocked ? "opacity-60" : ""}`}
                    >
                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ background: u.blocked ? "#6b7280" : "var(--gradient-primary)" }}
                          >
                            {u.username[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{u.username}</p>
                            {u.email && <p className="truncate text-[10px] text-muted-foreground">{u.email}</p>}
                          </div>
                        </div>
                      </td>
                      {/* UUID */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {u.uuid.slice(0, 8)}…
                        </span>
                      </td>
                      {/* IP */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs">{u.ip}</span>
                      </td>
                      {/* Location */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.city || u.country
                          ? <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[u.city, u.country].filter(Boolean).join(", ")}</span>
                          : "—"}
                      </td>
                      {/* Logins */}
                      <td className="px-4 py-3 text-center text-xs font-semibold text-primary">
                        {u.loginCount}
                      </td>
                      {/* Last seen */}
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(u.lastSeen)}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        {u.blocked
                          ? <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400"><Ban className="h-3 w-3" /> Blocked</span>
                          : <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400"><CheckCircle2 className="h-3 w-3" /> Active</span>}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {u.blocked
                          ? (
                            <button onClick={() => doUnblock(u.uuid)}
                              className="flex items-center gap-1 rounded-lg bg-green-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-green-400 hover:bg-green-500/20 transition">
                              <CheckCircle2 className="h-3 w-3" /> Unblock
                            </button>
                          ) : (
                            <button onClick={() => { setConfirming(u.uuid); setBlockReason(""); }}
                              className="flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 transition">
                              <Ban className="h-3 w-3" /> Block
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">No users match your filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Block confirm modal ───────────────────────────────────────────── */}
      {confirming && (() => {
        const u = users.find((x) => x.uuid === confirming)!;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirming(null)} />
            <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border/60 p-6 shadow-2xl"
              style={{ background: "var(--card)" }}>
              <button onClick={() => setConfirming(null)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15">
                  <Ban className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold">Block user?</p>
                  <p className="text-xs text-muted-foreground">@{u?.username}</p>
                </div>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                This user will be immediately prevented from signing in. You can unblock them at any time.
              </p>
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Reason <span className="opacity-50">(optional)</span></label>
                <input
                  value={blockReason} onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g. Abusive behaviour, spam…"
                  className="w-full rounded-xl border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-red-400"
                  style={{ color: "var(--foreground)" }}
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirming(null)}
                  className="flex-1 rounded-xl glass py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
                <button onClick={() => doBlock(confirming)}
                  className="flex-1 rounded-xl bg-red-500/90 py-2.5 text-sm font-bold text-white hover:bg-red-500 transition">
                  Block User
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── User detail drawer ────────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-end p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative z-10 flex h-full max-h-[90vh] w-full max-w-sm flex-col overflow-y-auto rounded-2xl border border-border/60 shadow-2xl"
            style={{ background: "var(--card)" }}>
            {/* Header */}
            <div className="relative overflow-hidden p-6 pb-4">
              <div className="pointer-events-none absolute inset-0 opacity-10"
                style={{ background: "var(--gradient-primary)" }} />
              <button onClick={() => setSelected(null)}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
              <div className="relative flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-black text-white shadow"
                  style={{ background: selected.blocked ? "#6b7280" : "var(--gradient-primary)" }}>
                  {selected.username[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-lg font-bold" style={{ fontFamily: "Space Grotesk" }}>@{selected.username}</p>
                  {selected.blocked
                    ? <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-400"><Ban className="h-3 w-3" /> Blocked</span>
                    : <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-green-400"><CheckCircle2 className="h-3 w-3" /> Active</span>}
                </div>
              </div>
            </div>

            {/* Detail rows */}
            <div className="flex-1 space-y-1 px-4 py-2">
              {[
                { icon: <Hash className="h-3.5 w-3.5" />,         label: "UUID",         value: selected.uuid },
                { icon: <Mail className="h-3.5 w-3.5" />,         label: "Email",        value: selected.email ?? "—" },
                { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Email verified",value: selected.email_confirmed ? "Yes ✓" : "Not verified" },
                { icon: <Wifi className="h-3.5 w-3.5" />,         label: "IP address",   value: selected.ip },
                { icon: <MapPin className="h-3.5 w-3.5" />,       label: "City",         value: selected.city ?? "—" },
                { icon: <Globe className="h-3.5 w-3.5" />,        label: "Country",      value: selected.country ?? "—" },
                { icon: <Activity className="h-3.5 w-3.5" />,     label: "ISP / Org",    value: selected.org ?? "—" },
                { icon: <TrendingUp className="h-3.5 w-3.5" />,   label: "Total logins", value: String(selected.loginCount) },
                { icon: <CalendarDays className="h-3.5 w-3.5" />, label: "First seen",   value: new Date(selected.firstSeen).toLocaleString() },
                { icon: <Clock className="h-3.5 w-3.5" />,        label: "Last seen",    value: new Date(selected.lastSeen).toLocaleString() },
                selected.blockedReason ? { icon: <Ban className="h-3.5 w-3.5" />, label: "Block reason", value: selected.blockedReason } : null,
              ].filter(Boolean).map((row) => row && (
                <div key={row.label} className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-white/5">
                  <span className="mt-0.5 shrink-0 text-muted-foreground">{row.icon}</span>
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{row.label}</span>
                  <span className="min-w-0 break-all text-xs font-medium">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Action */}
            <div className="border-t border-border/40 p-4">
              {selected.blocked
                ? (
                  <button onClick={() => { doUnblock(selected.uuid); setSelected(null); }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500/15 py-3 text-sm font-semibold text-green-400 hover:bg-green-500/25 transition">
                    <CheckCircle2 className="h-4 w-4" /> Unblock User
                  </button>
                ) : (
                  <button onClick={() => { setSelected(null); setConfirming(selected.uuid); setBlockReason(""); }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/15 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/25 transition">
                    <Ban className="h-4 w-4" /> Block User
                  </button>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Time-ago helper ────────────────────────────────────────────────────────────
function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)    return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Projects panel ───────────────────────────────────────────────────────────
function ProjectsPanel() {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const sb = await trySupabaseAdmin();
        if (!sb) throw new Error("Supabase admin client not available");
        const { data: rows, error: err } = await sb.from("projects")
          .select("id, user_id, name, file_name, width, height, bands, epsg, projected, last_index, created_at, updated_at")
          .order("updated_at", { ascending: false }).limit(500);
        if (err) throw new Error(err.message);
        setData(rows ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load projects");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <PanelLoader />;
  if (error) return <PanelError err={error} />;
  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Projects"      value={rows.length} icon={<FolderOpen className="h-4 w-4" />} color="primary" />
        <StatCard label="Georef'd"      value={rows.filter((r) => r.projected).length} icon={<Globe className="h-4 w-4" />} color="blue" />
        <StatCard label="Multi-band"    value={rows.filter((r) => r.bands > 1).length} icon={<BarChart3 className="h-4 w-4" />} color="green" />
        <StatCard label="Unique Owners" value={new Set(rows.map((r) => r.user_id)).size} icon={<Users className="h-4 w-4" />} color="orange" />
      </div>
      <div className="glass overflow-hidden rounded-2xl border border-border/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">File</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">Bands</th>
                <th className="px-5 py-3">EPSG</th>
                <th className="px-5 py-3">Last index</th>
                <th className="px-5 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                  <td className="px-5 py-3 font-medium">{r.name}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{r.file_name}</td>
                  <td className="px-5 py-3 text-xs">{r.width}×{r.height}</td>
                  <td className="px-5 py-3 text-xs">{r.bands}</td>
                  <td className="px-5 py-3 text-xs">{r.epsg ?? "—"}</td>
                  <td className="px-5 py-3 text-xs">{r.last_index ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No projects yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Shares panel ─────────────────────────────────────────────────────────────
function SharesPanel() {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const sb = await trySupabaseAdmin();
      if (!sb) throw new Error("Supabase admin client not available");
      const { data: rows, error: err } = await sb.from("timeseries_shares")
        .select("id, user_id, title, created_at").order("created_at", { ascending: false }).limit(500);
      if (err) throw new Error(err.message);
      setData(rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shares");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this share permanently?")) return;
    try {
      const sb = await trySupabaseAdmin();
      if (!sb) throw new Error("Supabase admin client not available");
      const { error } = await sb.from("timeseries_shares").delete().eq("id", id);
      if (error) throw new Error(error.message);
      toast.success("Share deleted");
      setData((prev) => (prev ?? []).filter((r) => r.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <PanelLoader />;
  if (error) return <PanelError err={error} />;
  const rows = data ?? [];

  return (
    <div className="glass overflow-hidden rounded-2xl border border-border/40">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/40 bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Owner</th>
              <th className="px-5 py-3">Created</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                <td className="px-5 py-3 font-medium">{r.title}</td>
                <td className="px-5 py-3 font-mono text-[10px] text-muted-foreground">{r.user_id.slice(0, 8)}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <a href={`/share/timeseries/${r.id}`} target="_blank" rel="noreferrer"
                      className="glass flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-primary transition-colors">
                      <ExternalLink className="h-3 w-3" /> Open
                    </a>
                    <button onClick={() => handleDelete(r.id)}
                      className="glass flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-destructive transition-colors">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No shared time-series yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────
type ColorKey = "primary" | "green" | "blue" | "orange";

const COLOR_MAP: Record<ColorKey, string> = {
  primary: "text-primary",
  green:   "text-green-400",
  blue:    "text-blue-400",
  orange:  "text-orange-400",
};

const BG_MAP: Record<ColorKey, string> = {
  primary: "bg-primary/10",
  green:   "bg-green-500/10",
  blue:    "bg-blue-500/10",
  orange:  "bg-orange-500/10",
};

function StatCard({
  label, value, icon, color = "primary",
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: ColorKey;
}) {
  return (
    <div className="glass rounded-2xl border border-border/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && (
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${BG_MAP[color]}`}>
            <span className={COLOR_MAP[color]}>{icon}</span>
          </div>
        )}
      </div>
      <div className="mt-3 text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>{value}</div>
    </div>
  );
}

function PanelLoader() {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function PanelError({ err }: { err: unknown }) {
  return (
    <div className="glass rounded-2xl border border-destructive/40 p-5 text-sm text-destructive">
      {err instanceof Error ? err.message : String(err)}
    </div>
  );
}
