import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Sparkles, Bot } from "lucide-react";

// Puter.js is loaded via a <script> tag in __root.tsx.
// It exposes a global `puter` object with free AI access — no API key required.
declare global {
  interface Window {
    puter: {
      auth?: unknown;
      ai?: {
        chat: (
          prompt: string,
          options?: { model?: string; stream?: boolean }
        ) => Promise<{
          message?: { content?: string };
          content?: string;
          text?: string;
          toString(): string;
        }>;
      };
    };
  }
}

interface Message { role: "user" | "assistant"; content: string; }

const SUGGESTIONS = [
  "Explain what NDVI values mean",
  "Summarize this dataset",
  "How can I detect clouds in satellite imagery?",
  "What does a negative NDWI indicate?",
  "What are the best bands for vegetation analysis?",
  "How do I interpret thermal infrared data?",
];

export function AIChat({ datasetContext }: { datasetContext?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setError(null);

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Build a prompt that includes the satellite dataset context when available
      const systemPrefix = datasetContext
        ? `You are SatVision AI, a geospatial intelligence assistant. The user has loaded the following satellite dataset:\n\n${datasetContext}\n\nAnswer questions about it concisely and accurately.\n\nUser: `
        : "You are SatVision AI, a geospatial intelligence assistant specialising in satellite imagery, remote sensing, and spectral analysis. Be concise and accurate.\n\nUser: ";

      const fullPrompt = systemPrefix + text;

      // Call Puter.js — free AI (GPT-4o), runs entirely in the browser, no API key needed
      const response = await window.puter.ai!.chat(fullPrompt);

      const reply =
        response.message?.content ??
        response.content ??
        response.text ??
        response.toString();

      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI request failed";
      setError(msg);
      setMessages([...newMessages, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">SatVision AI</h3>
          <p className="text-xs text-muted-foreground">Powered by Puter AI</p>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="mb-3 flex-1 space-y-3 overflow-y-auto rounded-xl bg-black/10 p-3"
        style={{ minHeight: 200 }}
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" /> Try asking:
            </div>
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
            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
          </div>
        ))}

        {loading && (
          <div className="mr-6 glass flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the dataset…"
          className="flex-1 rounded-xl border border-border bg-input px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl px-4 text-primary-foreground transition-all hover:glow disabled:opacity-50"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
