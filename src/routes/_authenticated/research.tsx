import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Satellite, FileText, Download, Copy, Loader2,
  BookOpen, Sparkles, ChevronDown, Check, AlertCircle,
  ArrowLeft, Code, FileDown,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/research")({
  ssr: false,
  component: ResearchPage,
});

// Puter AI global
declare global {
  interface Window {
    puter: { ai: { chat: (p: string) => Promise<{ message?: { content?: string }; content?: string; text?: string; toString(): string }> } };
  }
}

const FORMATS = [
  { id: "IEEE",      label: "IEEE",       desc: "Numbered citations, two-column, 10pt Times",       cite: "IEEE numbered [1]" },
  { id: "Elsevier",  label: "Elsevier",   desc: "Author–year, one-column, structured abstract",      cite: "Harvard author-date" },
  { id: "Harvard",   label: "Harvard",    desc: "Author–date refs, essay-style, APA variant",        cite: "APA / Harvard" },
  { id: "MIT",       label: "MIT",        desc: "Technical report style, numbered sections",         cite: "IEEE numbered [1]" },
  { id: "Stanford",  label: "Stanford",   desc: "Two-column conference format, 9pt, ACM-like",       cite: "ACM [Author, Year]" },
  { id: "APA",       label: "APA 7th",    desc: "Psychology / social science, 12pt, double-spaced",  cite: "APA 7th author-date" },
  { id: "Nature",    label: "Nature",     desc: "Short structured papers, superscript refs",          cite: "Nature superscript¹" },
  { id: "Springer",  label: "Springer",   desc: "LNCS/LNAI format, numbered, 10pt",                  cite: "Springer numbered" },
];

const MODES = [
  { id: "markdown", label: "Normal Download", sub: "Markdown + bibliography (Word / PDF ready)", icon: <FileDown className="h-4 w-4" /> },
  { id: "latex",    label: "Overleaf / LaTeX", sub: "Paste directly into Overleaf — compiles instantly", icon: <Code className="h-4 w-4" /> },
];

const SYSTEM_PROMPT = `You are an expert academic AI writer and LaTeX specialist. Your task is to generate a comprehensive, publication-ready research paper based on the user's inputs.

### 1. Formatting & Template Requirements
Structure the entire document to exactly match the target format's style guide regarding:
- Typography (font size, line spacing, margins)
- Citation style as specified
- Section hierarchies (Abstract, Introduction, Methodology, Results, Discussion, Conclusion, References)

### 2. Output and Export Formats
- [NORMAL DOWNLOAD MODE]: Output cleanly rendered Markdown with explicit formatting markers, structured sections, and a perfectly cited bibliography at the end.
- [OVERLEAF / LATEX MODE]: Output 100% valid, error-free LaTeX code. Include all necessary packages, document class (e.g., \\documentclass{ieeeconf}), macro definitions, author blocks, and a fully populated \\bibliography section. The user must be able to copy-paste into Overleaf and compile instantly without errors.

### 3. AI Text Humanization & Writing Style
- Variable sentence length: mix short analytical statements with complex multi-clause academic hypotheses
- Use precise domain-specific technical terminology; avoid: "In conclusion," "Furthermore," "Delve," "Tapestry," "Crucial," "Testament to"
- Balance active and passive voice (e.g., "We synthesized..." / "The empirical evidence suggests...")
- Write with deep, granular, rigorous analysis including numerical data or mathematical formulas where appropriate
- Minimum 1500 words for the body (excluding references)

Generate the full research paper now, strictly following these constraints.`;

function buildPrompt(title: string, abstract: string, format: string, mode: string, extra: string): string {
  const fmt = FORMATS.find((f) => f.id === format)!;
  return `${SYSTEM_PROMPT}

### 4. Input Parameters
- Topic/Title: ${title}
- Abstract/Core Idea: ${abstract}
- Selected Format: ${fmt.label} — ${fmt.desc} — Citation style: ${fmt.cite}
- Download Choice: ${mode === "latex" ? "[OVERLEAF / LATEX MODE]" : "[NORMAL DOWNLOAD MODE]"}
${extra ? `- Additional instructions: ${extra}` : ""}

Generate the complete paper now.`;
}

function downloadText(content: string, filename: string) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([content], { type: "text/plain" })),
    download: filename,
  });
  a.click();
}

// ─── Word count ────────────────────────────────────────────────────────────────
function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Main component ────────────────────────────────────────────────────────────
function ResearchPage() {
  const [title, setTitle]       = useState("");
  const [abstract, setAbstract] = useState("");
  const [format, setFormat]     = useState("IEEE");
  const [mode, setMode]         = useState<"markdown" | "latex">("markdown");
  const [extra, setExtra]       = useState("");
  const [output, setOutput]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [copied, setCopied]     = useState(false);
  const [step, setStep]         = useState(0);  // streaming progress step

  const STEPS = [
    "Planning paper structure…",
    "Writing introduction & background…",
    "Generating methodology & results…",
    "Composing discussion & conclusion…",
    "Formatting references…",
    "Applying style guide & finalising…",
  ];

  const generate = async () => {
    if (!title.trim() || !abstract.trim()) {
      setError("Please fill in both the title and the abstract idea.");
      return;
    }
    if (typeof window.puter === "undefined") {
      setError("Puter AI is not loaded yet — please wait a moment and try again.");
      return;
    }
    setError("");
    setOutput("");
    setLoading(true);
    setStep(0);

    // Fake progress ticker
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000);

    try {
      const prompt = buildPrompt(title, abstract, format, mode, extra);
      const res = await window.puter.ai.chat(prompt);
      const text = res.message?.content ?? res.content ?? res.text ?? res.toString();
      setOutput(text);
      toast.success("Paper generated!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      clearInterval(ticker);
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const slug = title.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40) || "paper";
    const ext  = mode === "latex" ? ".tex" : ".md";
    downloadText(output, slug + ext);
    toast.success(`Downloaded as ${slug}${ext}`);
  };

  const selectedFmt = FORMATS.find((f) => f.id === format)!;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b border-border/40">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg glow" style={{ background: "var(--gradient-primary)" }}>
              <Satellite className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold" style={{ fontFamily: "Space Grotesk" }}>
              SatVision <span className="text-gradient">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="glass flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium hover:bg-white/5">
              <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-6 py-8">
        {/* Page heading */}
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <BookOpen className="h-3.5 w-3.5" /> AI Research Paper Generator
          </div>
          <h1 className="text-4xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
            Publication-Ready <span className="text-gradient">Papers</span>
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Describe your topic and idea. Choose a journal or university format.
            Get a full research paper — in Markdown or paste-ready LaTeX for Overleaf.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">

          {/* ── LEFT: Input form ────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Title */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Paper Title / Topic <span className="text-destructive">*</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Thermospheric Mass Density Variations During Geomagnetic Storms"
                className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary"
                style={{ color: "var(--foreground)" }}
              />
            </div>

            {/* Abstract idea */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Abstract / Core Idea <span className="text-destructive">*</span>
              </label>
              <textarea
                rows={5}
                value={abstract}
                onChange={(e) => setAbstract(e.target.value)}
                placeholder="Describe the research problem, approach, key findings, and significance. The AI will expand this into a full paper…"
                className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary"
                style={{ resize: "vertical", color: "var(--foreground)" }}
              />
            </div>

            {/* Format selector */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Target Format / Journal
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all ${
                      format === f.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border glass text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    <span className="text-xs font-bold">{f.label}</span>
                    <span className="mt-0.5 text-[10px] leading-tight opacity-70">{f.desc}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Citation style: <span className="font-medium text-primary">{selectedFmt.cite}</span>
              </p>
            </div>

            {/* Output mode */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Output Format
              </label>
              <div className="space-y-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id as "markdown" | "latex")}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      mode === m.id
                        ? "border-primary bg-primary/10"
                        : "border-border glass text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <span className={mode === m.id ? "text-primary" : ""}>{m.icon}</span>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${mode === m.id ? "text-primary" : ""}`}>{m.label}</p>
                      <p className="text-[11px] text-muted-foreground">{m.sub}</p>
                    </div>
                    {mode === m.id && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Extra instructions */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Additional Instructions <span className="opacity-50">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="e.g. Include a section on NRLMSISE-00 model comparison, add a data table…"
                className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary"
                style={{ resize: "vertical", color: "var(--foreground)" }}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            <button
              onClick={generate}
              disabled={loading || !title.trim() || !abstract.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "var(--gradient-primary)" }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                : <><Sparkles className="h-4 w-4" /> Generate Paper</>}
            </button>
          </div>

          {/* ── RIGHT: Output ───────────────────────────────────────────────── */}
          <div className="flex flex-col">
            {loading && (
              <div className="mb-4 glass rounded-2xl border border-border/40 p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--gradient-primary)" }}>
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Writing your paper…</p>
                    <p className="text-xs text-muted-foreground">{STEPS[step]}</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
                  <div
                    className="h-full rounded-full transition-all duration-[4000ms]"
                    style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: "var(--gradient-primary)" }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {STEPS.map((s, i) => (
                    <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] transition-all ${i <= step ? "bg-primary/20 text-primary" : "bg-muted/10 text-muted-foreground"}`}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!output && !loading && (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
                <FileText className="mb-3 h-12 w-12 text-muted-foreground/30" />
                <p className="text-sm font-medium text-muted-foreground">Your paper will appear here</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  Fill in the title, idea, choose a format, and click Generate Paper
                </p>
                <div className="mt-6 grid grid-cols-2 gap-2 max-w-sm w-full px-6">
                  {[
                    "IEEE format with numbered refs",
                    "Harvard author-date citations",
                    "Overleaf / LaTeX output",
                    "6 structured sections",
                    "Humanized academic prose",
                    "Full bibliography",
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Check className="h-3 w-3 text-primary shrink-0" /> {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {output && (
              <div className="flex flex-1 flex-col gap-3">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${mode === "latex" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"}`}>
                      {mode === "latex" ? "LaTeX / Overleaf" : "Markdown"}
                    </span>
                    <span className="text-xs text-muted-foreground">{selectedFmt.label} format</span>
                    <span className="text-xs text-muted-foreground">· {wordCount(output).toLocaleString()} words</span>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button onClick={handleCopy}
                      className="glass flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium hover:text-primary transition-colors">
                      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                    <button onClick={handleDownload}
                      className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-all hover:brightness-110"
                      style={{ background: "var(--gradient-primary)" }}>
                      <Download className="h-3.5 w-3.5" />
                      Download {mode === "latex" ? ".tex" : ".md"}
                    </button>
                  </div>
                </div>

                {/* LaTeX hint */}
                {mode === "latex" && (
                  <div className="flex items-start gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-xs text-orange-300">
                    <Code className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Copy the code below → paste into a new Overleaf project → click Compile. All packages are included.
                  </div>
                )}

                {/* Output area */}
                <div
                  className={`flex-1 overflow-auto rounded-2xl border border-border/40 ${mode === "latex" ? "bg-black/40" : "glass"}`}
                  style={{ minHeight: 500 }}
                >
                  {mode === "latex" ? (
                    <pre className="p-5 font-mono text-[12px] leading-relaxed text-green-300/90 whitespace-pre-wrap break-words">
                      {output}
                    </pre>
                  ) : (
                    <MarkdownPreview text={output} />
                  )}
                </div>

                {/* Regenerate */}
                <button
                  onClick={generate}
                  disabled={loading}
                  className="glass flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Regenerate
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Simple markdown preview ───────────────────────────────────────────────────
function MarkdownPreview({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="p-6 text-sm leading-relaxed space-y-1" style={{ color: "var(--foreground)" }}>
      {lines.map((line, i) => {
        if (/^# /.test(line)) return <h1 key={i} className="text-xl font-bold mt-4 mb-2" style={{ fontFamily: "Space Grotesk" }}>{line.slice(2)}</h1>;
        if (/^## /.test(line)) return <h2 key={i} className="text-base font-bold mt-4 mb-1.5 text-primary">{line.slice(3)}</h2>;
        if (/^### /.test(line)) return <h3 key={i} className="text-sm font-semibold mt-3 mb-1">{line.slice(4)}</h3>;
        if (/^#### /.test(line)) return <h4 key={i} className="text-sm font-semibold text-muted-foreground mt-2">{line.slice(5)}</h4>;
        if (/^\*\*\*/.test(line) || /^---/.test(line)) return <hr key={i} className="border-border/40 my-3" />;
        if (/^- /.test(line) || /^\* /.test(line)) return (
          <div key={i} className="flex items-start gap-2 ml-4">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-muted-foreground">{inline(line.slice(2))}</span>
          </div>
        );
        if (/^\d+\. /.test(line)) {
          const num = line.match(/^(\d+)\. /)?.[1];
          return (
            <div key={i} className="flex items-start gap-2 ml-4">
              <span className="mt-0.5 text-xs font-bold text-primary">{num}.</span>
              <span className="text-muted-foreground">{inline(line.replace(/^\d+\. /, ""))}</span>
            </div>
          );
        }
        if (/^```/.test(line)) return <div key={i} className="font-mono text-xs text-orange-300/80 bg-black/30 px-3 py-1 rounded">{line}</div>;
        if (line.trim() === "") return <div key={i} className="h-2" />;
        return <p key={i} className="text-muted-foreground">{inline(line)}</p>;
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^\*\*/.test(p)
      ? <strong key={i} className="text-foreground font-semibold">{p.slice(2, -2)}</strong>
      : p
  );
}
