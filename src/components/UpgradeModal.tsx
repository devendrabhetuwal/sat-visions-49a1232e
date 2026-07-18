import { X, Zap, Check, Star, Sparkles, Lock } from "lucide-react";
import { activatePro } from "../lib/usage-limit";
import { toast } from "sonner";

interface UpgradeModalProps {
  feature: "ai_chat" | "research" | "data_lab";
  onClose: () => void;
}

const FEATURE_LABELS: Record<string, { name: string; icon: string }> = {
  ai_chat:  { name: "AI Satellite Chat",          icon: "🛰️" },
  research: { name: "AI Research Paper Generator", icon: "📄" },
  data_lab: { name: "Space Data Lab",              icon: "🧪" },
};

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$9",
    period: "/month",
    desc: "Perfect for individual researchers",
    color: "#6ec6f5",
    features: [
      "50 AI chat messages / month",
      "20 research papers / month",
      "20 data lab imports / month",
      "Markdown & LaTeX export",
      "Email support",
    ],
    cta: "Get Starter",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$19",
    period: "/month",
    desc: "Unlimited access for power users",
    color: "#a78bfa",
    features: [
      "Unlimited AI chat messages",
      "Unlimited research papers",
      "Unlimited data lab imports",
      "All 8 journal formats",
      "All 7 chart types",
      "Priority AI processing",
      "Priority support",
    ],
    cta: "Get Pro — Most Popular",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$49",
    period: "/month",
    desc: "For teams and institutions",
    color: "#f59e0b",
    features: [
      "Everything in Pro",
      "Up to 10 team seats",
      "API access",
      "Custom journal templates",
      "Dedicated account manager",
      "SLA & invoice billing",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

export default function UpgradeModal({ feature, onClose }: UpgradeModalProps) {
  const feat = FEATURE_LABELS[feature];

  const handlePurchase = (planId: string) => {
    if (planId === "enterprise") {
      toast.info("Contact us at sales@satvision.ai to set up Enterprise.");
      return;
    }
    // Demo: activate pro immediately for all paid plans
    activatePro();
    toast.success("🎉 Pro activated! Enjoy unlimited access.");
    onClose();
    // Reload so counters refresh
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-4xl rounded-3xl border border-border/60 shadow-2xl overflow-hidden"
        style={{ background: "var(--card)" }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="relative overflow-hidden px-8 pt-8 pb-6 text-center">
          {/* Glow bg */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-60 w-60 rounded-full opacity-20 blur-3xl"
              style={{ background: "var(--gradient-primary)" }} />
          </div>

          <div className="relative">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-1.5 text-sm font-medium text-destructive">
              <Lock className="h-3.5 w-3.5" />
              Free limit reached for {feat.icon} {feat.name}
            </div>
            <h2 className="text-3xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
              Upgrade for <span className="text-gradient">Unlimited Access</span>
            </h2>
            <p className="mt-2 text-muted-foreground">
              You've used all <strong>5 free uses</strong> for this feature.
              Choose a plan to keep going.
            </p>
          </div>
        </div>

        {/* Plans */}
        <div className="grid gap-4 px-8 pb-8 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                plan.popular
                  ? "border-primary/60 bg-primary/5 shadow-lg shadow-primary/10"
                  : "border-border/40 glass"
              }`}
            >
              {plan.popular && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-white"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Star className="h-3 w-3 fill-white" /> Most Popular
                </div>
              )}

              <div className="mb-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: plan.color }}>
                  {plan.name}
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="mb-1 text-sm text-muted-foreground">{plan.period}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{plan.desc}</p>
              </div>

              <ul className="mb-5 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePurchase(plan.id)}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all hover:brightness-110 active:scale-[0.98] ${
                  plan.popular
                    ? "text-white"
                    : "glass text-foreground hover:text-primary"
                }`}
                style={plan.popular ? { background: "var(--gradient-primary)" } : {}}
              >
                {plan.popular && <Sparkles className="h-4 w-4" />}
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <div className="border-t border-border/40 px-8 py-4 text-center text-xs text-muted-foreground">
          All plans include a 7-day money-back guarantee · Cancel anytime · Secure checkout
        </div>
      </div>
    </div>
  );
}
