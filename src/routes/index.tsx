import { createFileRoute, Link } from "@tanstack/react-router";
import { Satellite, Sparkles, Map, Brain, Upload, LineChart, ArrowRight, FileText, Download, FolderOpen, FlaskConical } from "lucide-react";
import heroEarth from "@/assets/hero-earth.jpg";
import { MarketingFooter } from "./about";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Feature({ icon: Icon, title, desc }: { icon: typeof Satellite; title: string; desc: string }) {
  return (
    <div className="glass rounded-2xl p-6 transition-transform hover:-translate-y-1">
      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--gradient-primary)" }}>
        <Icon className="h-5 w-5 text-primary-foreground" />
      </div>
      <h3 className="mb-2 font-semibold text-foreground" style={{ fontFamily: "Space Grotesk" }}>{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
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
            <Link to="/data-lab" activeProps={{ className: "text-foreground" }} className="flex items-center gap-1 hover:text-foreground transition-colors">
              <FlaskConical className="h-3.5 w-3.5" /> Data Lab
            </Link>
            <Link to="/docs" activeProps={{ className: "text-foreground" }}>Docs</Link>
            <Link to="/pricing" activeProps={{ className: "text-foreground" }}>Pricing</Link>
            <Link to="/contact" activeProps={{ className: "text-foreground" }}>Contact</Link>
          </nav>
          <Link
            to="/auth"
            className="glass rounded-full px-5 py-2 text-sm font-medium transition-all hover:glow"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <div className="glass mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              AI-powered geospatial intelligence
            </div>
            <h1 className="mb-6 text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl" style={{ fontFamily: "Space Grotesk" }}>
              See Earth the way <span className="text-gradient">AI does.</span>
            </h1>
            <p className="mb-8 max-w-lg text-lg text-muted-foreground">
              Upload GeoTIFF satellite imagery, compute vegetation and water indices in your browser, and ask an AI assistant to explain the science — all in one workspace.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:glow"
                style={{ background: "var(--gradient-primary)" }}
              >
                Launch dashboard
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#features" className="glass inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium">
                Explore features
              </a>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 -z-10 blur-3xl" style={{ background: "var(--gradient-aurora)" }} />
            <img
              src={heroEarth}
              alt="Earth from orbit with aurora"
              width={1024}
              height={1024}
              className="mx-auto w-full max-w-md rounded-3xl glass p-2"
              style={{ animation: "float 8s ease-in-out infinite" }}
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 pb-24">
        <h2 className="mb-2 text-center text-3xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
          Built for <span className="text-gradient">remote sensing scientists</span>
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
          A modern browser-native toolkit. No installs, no CLIs — just your data and AI.
        </p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <Feature icon={Upload} title="GeoTIFF Upload" desc="Drop a single or multi-band GeoTIFF and we'll parse metadata, bounds, and CRS instantly." />
          <Feature icon={Map} title="Interactive Maps" desc="Leaflet-powered layers with satellite, terrain, and street basemaps plus overlay support." />
          <Feature icon={LineChart} title="7 spectral indices" desc="NDVI, NDWI, EVI, SAVI, NBR plus custom band math — real-time histogram statistics." />
          <Feature icon={Brain} title="AI Assistant" desc="Ask questions about your dataset. Get NDVI explanations, anomaly hints, and next steps." />
          <Feature icon={FileText} title="AI Reports" desc="One-click markdown analysis reports grounded in your data's statistics." />
          <Feature icon={Download} title="Export" desc="Download colorized index overlays as PNG and statistics as JSON." />
          <Feature icon={FolderOpen} title="Projects & History" desc="Save sessions with band selections, CRS, and stats to reopen anytime." />
          <Feature icon={Sparkles} title="Secure by default" desc="Row-level security, encrypted auth, and Google sign-in out of the box." />
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
