import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  checkIsAdmin,
  adminListUsers,
  adminListProjects,
  adminListShares,
  adminDeleteShare,
  adminGrantRole,
  adminRevokeRole,
} from "@/lib/admin.functions";
import {
  Shield,
  Users,
  FolderOpen,
  Share2,
  Trash2,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Satellite,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const res = await checkIsAdmin();
      if (!res.isAdmin) throw redirect({ to: "/dashboard" });
    } catch (e) {
      if ((e as { to?: string }).to) throw e;
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminPage,
});

type Tab = "users" | "projects" | "shares";

function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg glow"
              style={{ background: "var(--gradient-primary)" }}
            >
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
            <Link
              to="/dashboard"
              className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium"
            >
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
            Manage users, monitor activity, and moderate shared content.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <TabButton active={tab === "users"} onClick={() => setTab("users")} icon={<Users className="h-4 w-4" />}>
            Users
          </TabButton>
          <TabButton active={tab === "projects"} onClick={() => setTab("projects")} icon={<FolderOpen className="h-4 w-4" />}>
            All Projects
          </TabButton>
          <TabButton active={tab === "shares"} onClick={() => setTab("shares")} icon={<Share2 className="h-4 w-4" />}>
            Shared Time-series
          </TabButton>
        </div>

        {tab === "users" && <UsersPanel />}
        {tab === "projects" && <ProjectsPanel />}
        {tab === "shares" && <SharesPanel />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`glass flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
        active ? "border-primary/60 text-primary glow" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-lg border border-border/40 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
        {value}
      </div>
    </div>
  );
}

function UsersPanel() {
  const list = useServerFn(adminListUsers);
  const grant = useServerFn(adminGrantRole);
  const revoke = useServerFn(adminRevokeRole);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => list(),
  });

  const grantM = useMutation({
    mutationFn: (v: { user_id: string; role: "admin" | "user" }) => grant({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Role granted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const revokeM = useMutation({
    mutationFn: (v: { user_id: string; role: "admin" | "user" }) => revoke({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Role revoked");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading) return <PanelLoader />;
  if (error) return <PanelError err={error} />;

  const users = data ?? [];
  const admins = users.filter((u) => u.roles.includes("admin")).length;

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Users" value={users.length} />
        <StatCard label="Admins" value={admins} />
        <StatCard label="Confirmed" value={users.filter((u) => u.email_confirmed_at).length} />
        <StatCard label="Last 24h" value={users.filter((u) => u.last_sign_in_at && Date.now() - new Date(u.last_sign_in_at).getTime() < 86400000).length} />
      </div>

      <div className="glass overflow-hidden rounded-lg border border-border/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Last sign-in</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isAdmin = u.roles.includes("admin");
                return (
                  <tr key={u.id} className="border-b border-border/20 hover:bg-muted/10">
                    <td className="px-4 py-3 font-medium">{u.email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.provider}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {u.roles.map((r) => (
                          <span
                            key={r}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              r === "admin"
                                ? "bg-primary/20 text-primary"
                                : "bg-muted/40 text-muted-foreground"
                            }`}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {isAdmin ? (
                          <button
                            onClick={() => revokeM.mutate({ user_id: u.id, role: "admin" })}
                            className="glass flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-destructive"
                          >
                            <ShieldOff className="h-3 w-3" /> Revoke admin
                          </button>
                        ) : (
                          <button
                            onClick={() => grantM.mutate({ user_id: u.id, role: "admin" })}
                            className="glass flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-primary"
                          >
                            <ShieldCheck className="h-3 w-3" /> Make admin
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProjectsPanel() {
  const list = useServerFn(adminListProjects);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "projects"],
    queryFn: () => list(),
  });
  if (isLoading) return <PanelLoader />;
  if (error) return <PanelError err={error} />;
  const rows = data ?? [];
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Projects" value={rows.length} />
        <StatCard label="Georef'd" value={rows.filter((r) => r.projected).length} />
        <StatCard label="Multi-band" value={rows.filter((r) => r.bands > 1).length} />
        <StatCard label="Owners" value={new Set(rows.map((r) => r.user_id)).size} />
      </div>
      <div className="glass overflow-hidden rounded-lg border border-border/40">
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
                <th className="px-4 py-3">Owner</th>
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
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(r.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{r.user_id.slice(0, 8)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SharesPanel() {
  const list = useServerFn(adminListShares);
  const del = useServerFn(adminDeleteShare);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "shares"],
    queryFn: () => list(),
  });
  const removeM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "shares"] });
      toast.success("Share deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading) return <PanelLoader />;
  if (error) return <PanelError err={error} />;
  const rows = data ?? [];
  return (
    <div className="glass overflow-hidden rounded-lg border border-border/40">
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
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <a
                      href={`/share/timeseries/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="glass flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                    >
                      <ExternalLink className="h-3 w-3" /> Open
                    </a>
                    <button
                      onClick={() => {
                        if (confirm("Delete this share permanently?")) removeM.mutate(r.id);
                      }}
                      className="glass flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No shared time-series yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelLoader() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}
function PanelError({ err }: { err: unknown }) {
  return (
    <div className="glass rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
      {err instanceof Error ? err.message : "Failed to load"}
    </div>
  );
}