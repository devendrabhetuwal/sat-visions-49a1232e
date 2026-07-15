import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  datasetContext: z.string().min(10).max(6000),
  indexType: z.string().max(40).optional(),
  stats: z
    .object({
      min: z.number(),
      max: z.number(),
      mean: z.number(),
      count: z.number(),
    })
    .optional(),
});

export const generateAnalysisReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `Produce a professional remote-sensing analysis report in markdown.

Sections (use ## headings):
1. Dataset Overview
2. Spatial & Projection Notes
3. Index Interpretation ${data.indexType ? `(${data.indexType.toUpperCase()})` : ""}
4. Vegetation / Water / Change Insights
5. Recommended Next Steps

Ground your interpretation in the provided statistics. Be concise, scientific, and cite thresholds
(e.g., NDVI > 0.6 = dense vegetation). Avoid speculation about time-series unless the data supports it.

Dataset context:
${data.datasetContext}
${data.stats ? `\nStatistics: min=${data.stats.min.toFixed(3)}, max=${data.stats.max.toFixed(3)}, mean=${data.stats.mean.toFixed(3)}, valid pixels=${data.stats.count}` : ""}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are SatVision AI, an expert remote-sensing analyst. Write clear, evidence-based markdown reports." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in your workspace.");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const json = await res.json();
    return { report: (json.choices?.[0]?.message?.content as string) ?? "" };
  });