import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingNav, MarketingFooter } from "./about";
import { Check } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — SatVision AI" },
      { name: "description", content: "Free forever for individual research. Team and enterprise plans for organizations." },
      { property: "og:title", content: "SatVision AI Pricing" },
      { property: "og:description", content: "Simple pricing for researchers, teams, and enterprises." },
    ],
  }),
  component: PricingPage,
});

const TIERS = [
  { name: "Researcher", price: "Free", desc: "For individuals and academics.", features: ["Unlimited GeoTIFF uploads", "NDVI / NDWI / EVI / SAVI / NBR", "AI assistant (100 msgs/mo)", "Save up to 20 projects"], cta: "Start free" },
  { name: "Team", price: "$29", suffix: "/user / month", desc: "Collaborative geospatial workflows.", features: ["Everything in Researcher", "Unlimited AI messages", "Unlimited projects", "Shared workspaces", "Priority export queue"], cta: "Start 14-day trial", highlight: true },
  { name: "Enterprise", price: "Custom", desc: "For agencies and large organizations.", features: ["SSO / SAML", "On-prem or VPC deployment", "Custom index libraries", "Sentinel/Landsat integration", "Dedicated support"], cta: "Contact sales" },
];

function PricingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h1 className="mb-2 text-center text-5xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
          Simple, <span className="text-gradient">honest pricing</span>
        </h1>
        <p className="mb-12 text-center text-muted-foreground">Free for researchers. Pay for what your team actually uses.</p>

        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((t) => (
            <div key={t.name} className={`glass rounded-2xl p-6 ${t.highlight ? "ring-1 ring-primary glow" : ""}`}>
              <h3 className="mb-1 text-lg font-semibold" style={{ fontFamily: "Space Grotesk" }}>{t.name}</h3>
              <p className="mb-4 text-xs text-muted-foreground">{t.desc}</p>
              <div className="mb-6">
                <span className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk" }}>{t.price}</span>
                {t.suffix && <span className="text-xs text-muted-foreground">{t.suffix}</span>}
              </div>
              <ul className="mb-6 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to={t.name === "Enterprise" ? "/contact" : "/auth"}
                className={`block rounded-full px-4 py-2.5 text-center text-sm font-semibold ${t.highlight ? "text-primary-foreground" : "glass"}`}
                style={t.highlight ? { background: "var(--gradient-primary)" } : undefined}
              >
                {t.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}