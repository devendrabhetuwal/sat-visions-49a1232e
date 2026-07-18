import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/integrations/supabase/no-auth-middleware";
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
  .middleware([requireAdminSession])
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not configured. Add it to your environment variables.");

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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: "You are SatVision AI, an expert remote-sensing analyst. Write clear, evidence-based markdown reports." }],
          },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 3000 },
        }),
      }
    );

    if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
    if (!res.ok) throw new Error(`Gemini error ${res.status}`);
    const json = await res.json();
    const report = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { report };
  });
