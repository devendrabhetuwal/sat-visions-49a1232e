import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjects, deleteProject } from "@/lib/projects.functions";
import { Satellite, ArrowLeft, Trash2, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const navigate = useNavigate();
  const list = useServerFn(listProjects);
  const del = useServerFn(deleteProject);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => list(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg glow" style={{ background: "var(--gradient-primary)" }}>
              <Satellite className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold" style={{ fontFamily: "Space Grotesk" }}>
              SatVision <span className="text-gradient">AI</span>
            </span>
          </Link>
          <Link to="/dashboard" className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium">
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-2 text-3xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
          Your <span className="text-gradient">Projects</span>
        </h1>
        <p className="mb-8 text-sm text-muted-foreground">Saved analyses and dataset sessions.</p>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
          </div>
        )}

        {!isLoading && (data?.length ?? 0) === 0 && (
          <div className="glass rounded-2xl p-10 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No saved projects yet.</p>
            <Link
              to="/dashboard"
              className="mt-4 inline-flex rounded-full px-5 py-2 text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              Upload your first dataset
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.map((p) => (
            <div key={p.id} className="glass flex flex-col rounded-2xl p-5 transition-transform hover:-translate-y-0.5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="truncate text-sm font-semibold" style={{ fontFamily: "Space Grotesk" }}>{p.name}</h3>
                <button
                  onClick={() => remove.mutate(p.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete project"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-3 truncate font-mono text-[10px] text-muted-foreground">{p.file_name}</p>
              <dl className="mb-4 space-y-1 text-xs">
                <div className="flex justify-between"><dt className="text-muted-foreground">Dimensions</dt><dd className="font-mono">{p.width}×{p.height}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Bands</dt><dd className="font-mono">{p.bands}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">CRS</dt><dd className="font-mono">{p.epsg ? `EPSG:${p.epsg}` : p.projected ? "Projected" : "Geographic"}</dd></div>
                {p.last_index && (
                  <div className="flex justify-between"><dt className="text-muted-foreground">Last index</dt><dd className="font-mono uppercase">{p.last_index}</dd></div>
                )}
              </dl>
              <button
                onClick={() => navigate({ to: "/dashboard", search: { p: p.id } as never })}
                className="mt-auto rounded-full px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                Open
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}