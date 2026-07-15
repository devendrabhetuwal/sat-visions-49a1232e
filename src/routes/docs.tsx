import { createFileRoute } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "./about";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentation — SatVision AI" },
      { name: "description", content: "Learn how to upload GeoTIFFs, compute NDVI/NDWI/EVI/SAVI/NBR, and use the AI assistant." },
      { property: "og:title", content: "SatVision AI Documentation" },
      { property: "og:description", content: "Guides for uploading, analyzing, and exporting satellite imagery." },
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-4xl px-6 py-24">
        <h1 className="mb-2 text-4xl font-bold" style={{ fontFamily: "Space Grotesk" }}>Documentation</h1>
        <p className="mb-10 text-sm text-muted-foreground">Everything you need to run analyses in your browser.</p>

        <Section title="1. Uploading GeoTIFF data">
          <p>Supported: single or multi-band <code>.tif</code>/<code>.tiff</code>. Cloud-Optimized GeoTIFFs (COG) load fastest.
            Metadata (dimensions, bands, CRS, EPSG, bounding box) is parsed on the client. Nothing is uploaded to a server until you save a project.</p>
        </Section>

        <Section title="2. Vegetation & water indices">
          <p>Formulas we implement client-side:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>NDVI</strong> = (NIR − RED) / (NIR + RED). Values &gt; 0.6 → dense vegetation.</li>
            <li><strong>NDWI</strong> = (GREEN − NIR) / (GREEN + NIR). Values &gt; 0 → surface water.</li>
            <li><strong>EVI</strong> = 2.5 · (NIR − RED) / (NIR + 6·RED − 7.5·BLUE + 1). Reduces atmospheric noise.</li>
            <li><strong>SAVI</strong> = (1 + L)(NIR − RED) / (NIR + RED + L), L=0.5. Corrects for soil brightness.</li>
            <li><strong>NBR</strong> = (NIR − SWIR) / (NIR + SWIR). Burn severity mapping.</li>
            <li><strong>Custom</strong> — write your own formula (e.g. <code>(B3 - B2) / (B3 + B2)</code>). Bands are <code>B0</code>..<code>Bn</code>.</li>
          </ul>
        </Section>

        <Section title="3. Exporting results">
          <p>Export the colorized index overlay as PNG and download the full statistics + metadata as JSON.
            Save the session as a project to reopen later with band selections preserved.</p>
        </Section>

        <Section title="4. AI Assistant & Reports">
          <p>Ask natural-language questions about your dataset. The assistant is aware of your file metadata,
            band configuration, and last-computed index statistics. Click <em>Generate report</em> for a formatted
            markdown analysis you can copy into any notebook.</p>
        </Section>

        <Section title="5. Security">
          <p>All authentication is handled by Supabase with row-level security. Only you can read your saved projects.
            The AI Gateway is rate-limited and never exposes raw provider errors.</p>
        </Section>
      </section>
      <MarketingFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass mb-6 rounded-2xl p-6">
      <h2 className="mb-3 text-xl font-semibold" style={{ fontFamily: "Space Grotesk" }}>{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}