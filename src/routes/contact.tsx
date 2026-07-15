import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MarketingNav, MarketingFooter } from "./about";
import { Mail, MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — SatVision AI" },
      { name: "description", content: "Get in touch with the SatVision AI team for demos, enterprise plans, or partnerships." },
      { property: "og:title", content: "Contact SatVision AI" },
      { property: "og:description", content: "Talk to our team about demos, enterprise, or research collaborations." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      toast.success("Message queued — we'll be in touch soon.");
      (e.target as HTMLFormElement).reset();
      setLoading(false);
    }, 700);
  };
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="mb-2 text-5xl font-bold" style={{ fontFamily: "Space Grotesk" }}>
          Let's <span className="text-gradient">talk</span>.
        </h1>
        <p className="mb-10 text-muted-foreground">Have a large dataset, an enterprise question, or a research collaboration in mind?</p>

        <div className="mb-10 grid gap-4 md:grid-cols-2">
          <div className="glass rounded-2xl p-5">
            <Mail className="mb-2 h-5 w-5 text-primary" />
            <div className="text-sm font-semibold">Email</div>
            <a href="mailto:hello@satvision.ai" className="text-xs text-muted-foreground hover:text-foreground">hello@satvision.ai</a>
          </div>
          <div className="glass rounded-2xl p-5">
            <MessageSquare className="mb-2 h-5 w-5 text-primary" />
            <div className="text-sm font-semibold">Support</div>
            <p className="text-xs text-muted-foreground">Average reply time: under 24h</p>
          </div>
        </div>

        <form onSubmit={submit} className="glass space-y-3 rounded-2xl p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <input required name="name" placeholder="Your name" className="rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary" />
            <input required type="email" name="email" placeholder="you@example.com" className="rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary" />
          </div>
          <input name="org" placeholder="Organization (optional)" className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary" />
          <textarea required name="message" rows={5} placeholder="Tell us what you're building…" className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none focus:border-primary" />
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-primary)" }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send message"}
          </button>
        </form>
      </section>
      <MarketingFooter />
    </div>
  );
}