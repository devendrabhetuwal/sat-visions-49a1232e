import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Shield, Users, FolderOpen, Share2, Trash2, ArrowLeft,
  Loader2, Satellite, ExternalLink, Activity, Globe,
  TrendingUp, AlertTriangle, Flame, Wind, Waves,
  RefreshCw, Clock, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: () => {
    // Admin session is already verified by /_authenticated/route.tsx
  },
  component: AdminPage,
});

type Tab = "overview" | "logins" | "nasa" | "users" | "projects" | "shares";

// ─── Login event helpers ──────────────────────────────────────────────────────
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
  // Last 7 days
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    byDay[key] = 0;
  }
  for (const ev of events) {
    const d = new Date(ev.time);
    if (now - ev.time <= 7 * 86400000) {
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (key in byDay) byDay[key]++;
    }
  }
  return Object.entries(byDay).map(([date, logins]) => ({ date, logins }));
}

// ─── NASA EONET natural events ────────────────────────────────────────────────
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

// ─── Supabase helpers (optional — fail gracefully) ────────────────────────────
async function trySupabaseAdmin() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin;
  } catch {
    return null;
  }
}

// ─── Admin page ───────────────────────────────────────────────────────────────
function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg glow" style={{ background: "var(--gradient-primary)" }}>
              <Satellite className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold" style={{ fontFamily: "Space Grotesk" }}>
              SatVision <span className="text-gradient">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Shield className="h-3 w-3" /> Admin Console
            </span>
            <Link to="/dashboard" className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium">
              <ArrowLeft className="h-3.5 w-3.5" /> Exit
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
            <span className="text-gradient">Administration</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor users, activity, satellite events, and manage content.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {([
            { id: "overview", label: "Overview", icon: <BarChart3 className="h-4 w-4" /> },
            { id: "logins", label: "Login Log", icon: <Clock className="h-4 w-4" /> },
            { id: "nasa", label: "NASA Events", icon: <Globe className="h-4 w-4" /> },
            { id: "users", label: "Users", icon: <Users className="h-4 w-4" /> },
            { id: "projects", label: "Projects", icon: <FolderOpen className="h-4 w-4" /> },
            { id: "shares", label: "Shares", icon: <Share2 className="h-4 w-4" /> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`glass flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === t.id ? "border-primary/60 text-primary glow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && <OverviewPanel />}
        {tab === "logins" && <LoginLogPanel />}
        {tab === "nasa" && <NasaPanel />}
        {tab === "users" && <UsersPanel />}
        {tab === "projects" && <ProjectsPanel />}
        {tab === "shares" && <SharesPanel />}
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewPanel() {
  const events = getLoginEvents();
  const trafficData = getTrafficData();
  const totalLogins = events.length;
  const adminLogins = events.filter((e) => e.type === "admin").length;
  const userLogins = events.filter((e) => e.type === "user").length;
  const last24h = events.filter((e) => Date.now() - e.time < 86400000).length;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Logins" value={totalLogins} icon={<TrendingUp className="h-4 w-4 text-primary" />} />
        <StatCard label="Last 24 Hours" value={last24h} icon={<Activity className="h-4 w-4 text-green-400" />} />
        <StatCard label="User Sessions" value={userLogins} icon={<Users className="h-4 w-4 text-blue-400" />} />
        <StatCard label="Admin Sessions" value={adminLogins} icon={<Shield className="h-4 w-4 text-orange-400" />} />
      </div>

      {/* Traffic chart */}
      <div className="glass rounded-xl border border-border/40 p-5">
        <h2 className="mb-4 text-sm font-semibold">Login Traffic — Last 7 Days</h2>
        {totalLogins === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No login events recorded yet. Logins will appear here after users sign in.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trafficData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="logins" fill="url(#grad)" radius={[4, 4, 0, 0]} />
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6ec6f5" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent activity */}
      <div className="glass rounded-xl border border-border/40 p-5">
        <h2 className="mb-3 text-sm font-semibold">Recent Activity</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {[...events].reverse().slice(0, 8).map((ev, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-muted/10 px-3 py-2 text-xs">
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    ev.type === "admin" ? "bg-primary/20 text-primary" : "bg-blue-500/20 text-blue-400"
                  }`}>{ev.type}</span>
                  <span className="font-medium">{ev.username}</span> signed in
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

  useEffect(() => {
    setEvents([...getLoginEvents()].reverse());
  }, []);

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

      <div className="glass overflow-hidden rounded-xl border border-border/40">
        <table className="w-full text-sm">
          <thead className="border-b border-border/40 bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No login events recorded.</td></tr>
            )}
            {filtered.map((ev, i) => (
              <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    ev.type === "admin" ? "bg-primary/20 text-primary" : "bg-blue-500/20 text-blue-400"
                  }`}>{ev.type}</span>
                </td>
                <td className="px-4 py-3 font-medium">{ev.username}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(ev.time).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(ev.time).toLocaleTimeString()}</td>
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
    } catch (e) {
      setError("Failed to fetch NASA data. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Fetching NASA data…</div>;
  if (error) return <div className="glass rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}</div>;

  const categoryCounts: Record<string, number> = {};
  for (const ev of events) {
    const cat = ev.categories[0]?.title ?? "Other";
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }
  const categoryData = Object.entries(categoryCounts).map(([name, count]) => ({ name, count }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ fontFamily: "Space Grotesk" }}>NASA Earth Observatory Natural Events</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Live data via NASA EONET — {events.length} active events in last 30 days</p>
        </div>
        <button onClick={fetchData} className="glass flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs hover:text-primary">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Category breakdown chart */}
      {categoryData.length > 0 && (
        <div className="glass rounded-xl border border-border/40 p-5">
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

      {/* APOD */}
      {apod && apod.url?.match(/\.(jpg|jpeg|png|gif|webp)/i) && (
        <div className="glass overflow-hidden rounded-xl border border-border/40">
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

      {/* Events list */}
      <div className="glass overflow-hidden rounded-xl border border-border/40">
        <div className="border-b border-border/40 px-4 py-3">
          <h3 className="text-sm font-semibold">Active Natural Events</h3>
        </div>
        <div className="divide-y divide-border/20 max-h-[500px] overflow-y-auto">
          {events.map((ev) => {
            const cat = ev.categories[0]?.title ?? "Other";
            const latestDate = ev.geometry?.[ev.geometry.length - 1]?.date;
            return (
              <div key={ev.id} className="flex items-start justify-between px-4 py-3 hover:bg-muted/10">
                <div className="flex items-start gap-3 min-w-0">
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
                    className="ml-3 shrink-0 rounded-md glass px-2 py-1 text-[10px] flex items-center gap-1 hover:text-primary">
                    <ExternalLink className="h-3 w-3" /> Source
                  </a>
                )}
              </div>
            );
          })}
          {events.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No active events found.</div>
          )}
        </div>
      </div>

      {/* Data sources */}
      <div className="glass rounded-xl border border-border/40 p-4">
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
              className="glass flex items-start gap-2 rounded-lg p-3 hover:bg-white/5 transition-colors">
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
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const sb = await trySupabaseAdmin();
        if (!sb) throw new Error("Supabase not configured");
        const { data: users, error: err } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (err) throw new Error(err.message);
        const { data: roles } = await sb.from("user_roles").select("user_id, role");
        const rolesByUser = new Map<string, string[]>();
        for (const r of roles ?? []) {
          const list = rolesByUser.get(r.user_id) ?? [];
          list.push(r.role);
          rolesByUser.set(r.user_id, list);
        }
        setData((users?.users ?? []).map((u: any) => ({
          id: u.id, email: u.email ?? null, created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null, email_confirmed_at: u.email_confirmed_at ?? null,
          provider: u.app_metadata?.provider ?? "email",
          roles: rolesByUser.get(u.id) ?? [],
        })));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <PanelLoader />;
  if (error) return <PanelError err={error} />;
  const users = data ?? [];

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Users" value={users.length} />
        <StatCard label="Admins" value={users.filter((u) => u.roles.includes("admin")).length} />
        <StatCard label="Confirmed" value={users.filter((u) => u.email_confirmed_at).length} />
        <StatCard label="Active 24h" value={users.filter((u) => u.last_sign_in_at && Date.now() - new Date(u.last_sign_in_at).getTime() < 86400000).length} />
      </div>
      <div className="glass overflow-hidden rounded-xl border border-border/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="px-4 py-3 font-medium">{u.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.provider}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {u.roles.map((r: string) => (
                        <span key={r} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${r === "admin" ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"}`}>{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}</td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
        if (!sb) throw new Error("Supabase not configured");
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
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Projects" value={rows.length} />
        <StatCard label="Georef'd" value={rows.filter((r) => r.projected).length} />
        <StatCard label="Multi-band" value={rows.filter((r) => r.bands > 1).length} />
        <StatCard label="Unique Owners" value={new Set(rows.map((r) => r.user_id)).size} />
      </div>
      <div className="glass overflow-hidden rounded-xl border border-border/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Bands</th>
                <th className="px-4 py-3">EPSG</th>
                <th className="px-4 py-3">Last index</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{r.file_name}</td>
                  <td className="px-4 py-3 text-xs">{r.width}×{r.height}</td>
                  <td className="px-4 py-3 text-xs">{r.bands}</td>
                  <td className="px-4 py-3 text-xs">{r.epsg ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{r.last_index ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No projects yet.</td></tr>}
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
      if (!sb) throw new Error("Supabase not configured");
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
      if (!sb) throw new Error("Supabase not configured");
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
    <div className="glass overflow-hidden rounded-xl border border-border/40">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/40 bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/10">
                <td className="px-4 py-3 font-medium">{r.title}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{r.user_id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <a href={`/share/timeseries/${r.id}`} target="_blank" rel="noreferrer"
                      className="glass flex items-center gap-1 rounded-md px-2 py-1 text-xs">
                      <ExternalLink className="h-3 w-3" /> Open
                    </a>
                    <button onClick={() => handleDelete(r.id)}
                      className="glass flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-destructive">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No shared time-series yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────
function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="glass rounded-xl border border-border/40 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>{value}</div>
    </div>
  );
}

function PanelLoader() {
  return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
}
function PanelError({ err }: { err: unknown }) {
  return (
    <div className="glass rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
      {err instanceof Error ? err.message : String(err)}
    </div>
  );
}
