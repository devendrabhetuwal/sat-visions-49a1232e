import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { chatWithSatVision, getAiUsage } from "@/lib/ai-chat.functions";
import { Send, Loader2, Sparkles, Crown } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

interface Message { role: "user" | "assistant"; content: string; }

const SUGGESTIONS = [
  "Explain what NDVI values mean",
  "Summarize this dataset",
  "How can I detect clouds?",
  "What does a negative NDWI indicate?",
];

export function AIChat({ datasetContext }: { datasetContext?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<{ count: number; limit: number; isPremium: boolean; remaining: number | null } | null>(null);
  const chat = useServerFn(chatWithSatVision);
  const fetchUsage = useServerFn(getAiUsage);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    fetchUsage().then(setUsage).catch(() => {});
  }, [fetchUsage]);

  const limitReached = usage && !usage.isPremium && (usage.remaining ?? 0) <= 0;

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    if (limitReached) {
      toast.error("Free plan limit reached. Upgrade to Premium for unlimited AI.");
      return;
    }
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const { reply, usage: newUsage } = await chat({ data: { messages: newMessages, datasetContext } });
      setMessages([...newMessages, { role: "assistant", content: reply }]);
      if (newUsage) setUsage(newUsage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI request failed");
      setMessages(newMessages);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--gradient-primary)" }}>
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Assistant</h3>
            <p className="text-xs text-muted-foreground">Ask about your dataset</p>
          </div>
        </div>
        {usage && (
          usage.isPremium ? (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">
              <Crown className="h-3 w-3" /> Premium
            </span>
          ) : (
            <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-medium text-muted-foreground">
              {usage.remaining ?? 0}/{usage.limit} left
            </span>
          )
        )}
      </div>

      {limitReached && (
        <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
          <p className="mb-2 font-medium">You've used all 5 free AI messages.</p>
          <Link to="/pricing" className="inline-flex items-center gap-1 text-primary hover:underline">
            <Crown className="h-3 w-3" /> Upgrade to Premium for unlimited AI
          </Link>
        </div>
      )}

      <div ref={scrollRef} className="mb-3 flex-1 space-y-3 overflow-y-auto rounded-xl bg-black/10 p-3" style={{ minHeight: 200 }}>
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="glass block w-full rounded-lg px-3 py-2 text-left text-xs transition-all hover:bg-white/5"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl px-3 py-2 text-sm ${
              m.role === "user" ? "ml-6 bg-primary/10 text-foreground" : "mr-6 glass"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {loading && (
          <div className="mr-6 glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={limitReached ? "Upgrade to continue…" : "Ask about the dataset…"}
          disabled={!!limitReached}
          className="flex-1 rounded-xl border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || !!limitReached}
          className="rounded-xl px-4 text-primary-foreground transition-all hover:glow disabled:opacity-50"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
