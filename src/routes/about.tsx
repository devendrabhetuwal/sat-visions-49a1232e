import { createFileRoute, Link } from "@tanstack/react-router";
import { Satellite, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About SatVision AI — Team & Mission" },
      { name: "description", content: "SatVision AI blends remote sensing, GIS, and generative AI to make satellite intelligence accessible to every analyst." },
      { property: "og:title", content: "About SatVision AI" },
      { property: "og:description", content: "Our mission is to make satellite intelligence accessible to every analyst." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-4xl px-6 py-24">
        <h1 className="mb-6 text-5xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
          Satellite intelligence <span className="text-gradient">for everyone.</span>
        </h1>
        <p className="mb-6 text-lg text-muted-foreground">
          SatVision AI is a modern, browser-native geospatial workspace. We combine open remote-sensing science
          with large language models to help scientists, farmers, planners, and researchers make faster decisions
          from Earth observation data.
        </p>
        <div className="grid gap-6 md:grid-cols-3 md:gap-8">
          <Stat n="Petabytes" label="of Earth observation data indexed globally each year" />
          <Stat n="12+" label="vegetation, water, and burn indices supported" />
          <Stat n="0 installs" label="everything runs in your browser" />
        </div>
        <h2 className="mt-16 mb-4 text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>Our mission</h2>
        <p className="text-muted-foreground">
          Traditional GIS pipelines require expensive software, months of onboarding, and a stack of Python
          libraries. We believe modern browsers, WebAssembly, and generative AI can lower that barrier by an
          order of magnitude — without sacrificing rigor.
        </p>
        <h2 className="mt-12 mb-4 text-2xl font-bold" style={{ fontFamily: "Space Grotesk" }}>Built with</h2>
        <ul className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <li>• GeoTIFF client-side parsing (COG-ready)</li>
          <li>• Leaflet interactive mapping</li>
          <li>• Lovable AI Gateway (Gemini 2.5 Flash)</li>
          <li>• Supabase auth & row-level security</li>
          <li>• TanStack Start + React 19</li>
          <li>• Tailwind CSS v4</li>
        </ul>
      </section>
      <MarketingFooter />
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-2 text-3xl font-bold text-gradient" style={{ fontFamily: "Space Grotesk" }}>{n}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function MarketingNav() {
  return (
    <header className="fixed top-0 z-50 w-full">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg glow" style={{ background: "var(--gradient-primary)" }}>
            <Satellite className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight" style={{ fontFamily: "Space Grotesk" }}>
            SatVision <span className="text-gradient">AI</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link to="/about" activeProps={{ className: "text-foreground" }}>About</Link>
          <Link to="/docs" activeProps={{ className: "text-foreground" }}>Docs</Link>
          <Link to="/pricing" activeProps={{ className: "text-foreground" }}>Pricing</Link>
          <Link to="/contact" activeProps={{ className: "text-foreground" }}>Contact</Link>
        </nav>
        <Link to="/auth" className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium">
          <ArrowLeft className="h-3.5 w-3.5 rotate-180" /> Sign in
        </Link>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/40 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-xs text-muted-foreground md:flex-row">
        <p>© {new Date().getFullYear()} SatVision AI&nbsp;</p>
        <div className="flex gap-5">
          <Link to="/about">About</Link>
          <Link to="/docs">Docs</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/contact">Contact</Link>
        </div>
      </div>
    </footer>
  );
}