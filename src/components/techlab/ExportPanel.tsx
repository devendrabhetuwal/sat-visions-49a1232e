import { Download, FileSpreadsheet, FileText, Code, Table, Loader2 } from "lucide-react";

export type ExportFormat = "excel" | "notebook" | "html" | "csv";

interface ExportPanelProps {
  hasData: boolean;
  exportLoading: string | null;
  onExport: (format: ExportFormat) => void;
}

const FORMATS: Array<{
  id: ExportFormat;
  label: string;
  desc: string;
  icon: React.ReactNode;
  ext: string;
  color: string;
  badge?: string;
}> = [
  {
    id: "csv",
    label: "CSV",
    desc: "Plain comma-separated values. Compatible with Excel, MATLAB, Python, R, and every data tool.",
    icon: <Table className="h-6 w-6" />,
    ext: ".csv",
    color: "#34d399",
  },
  {
    id: "excel",
    label: "Excel Workbook",
    desc: "Multi-sheet .xlsx with your data, a statistics summary, and a correlation matrix.",
    icon: <FileSpreadsheet className="h-6 w-6" />,
    ext: ".xlsx",
    color: "#6ec6f5",
    badge: "Includes stats",
  },
  {
    id: "notebook",
    label: "Jupyter Notebook",
    desc: "Ready-to-run .ipynb with EDA, distribution plots, anomaly detection, and clustering cells.",
    icon: <Code className="h-6 w-6" />,
    ext: ".ipynb",
    color: "#f59e0b",
    badge: "Includes ML",
  },
  {
    id: "html",
    label: "HTML Report",
    desc: "Publication-ready dark-theme report with statistical summary and a full data preview.",
    icon: <FileText className="h-6 w-6" />,
    ext: ".html",
    color: "#a78bfa",
    badge: "Printable",
  },
];

export function ExportPanel({ hasData, exportLoading, onExport }: ExportPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          Export Your Data
        </h2>
        <p className="text-xs text-muted-foreground">
          Download in multiple formats. Excel and notebook exports include automated statistical analysis generated server-side.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FORMATS.map(fmt => (
          <div key={fmt.id} className="glass rounded-xl border border-border/40 p-5 flex flex-col gap-4 transition hover:border-border/70">
            <div className="flex items-start gap-3">
              <div className="rounded-xl p-2.5 flex-shrink-0" style={{ background: `${fmt.color}18`, color: fmt.color }}>
                {fmt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{fmt.label}</span>
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {fmt.ext}
                  </span>
                  {fmt.badge && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: `${fmt.color}18`, color: fmt.color }}>
                      {fmt.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{fmt.desc}</p>
              </div>
            </div>

            <button
              disabled={!hasData || exportLoading !== null}
              onClick={() => onExport(fmt.id)}
              className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
              style={{
                background: `${fmt.color}20`,
                color: fmt.color,
                border: `1px solid ${fmt.color}40`,
              }}>
              {exportLoading === fmt.id ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
              ) : (
                <><Download className="h-3.5 w-3.5" /> Download {fmt.ext}</>
              )}
            </button>
          </div>
        ))}
      </div>

      {!hasData && (
        <div className="rounded-xl border border-dashed border-border/40 py-10 text-center">
          <p className="text-sm text-muted-foreground">Load data in the Import & Clean tab to enable exports.</p>
        </div>
      )}
    </div>
  );
}
