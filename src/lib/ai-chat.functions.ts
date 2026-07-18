import { createServerFn } from "@tanstack/react-start";
import { requireAdminSession } from "@/integrations/supabase/no-auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() }))
    .min(1)
    .max(100),
  datasetContext: z.string().max(4000).optional(),
});

export const chatWithSatVision = createServerFn({ method: "POST" })
  .middleware([requireAdminSession])
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not configured. Add it to your environment variables.");

    const systemPrompt = `You are SatVision AI, an expert remote-sensing and geospatial analyst.
You help users interpret satellite datasets, NDVI/NDWI, cloud coverage, vegetation and water indices,
land-cover, and atmospheric/ocean data. Be concise, scientific, and use markdown when helpful.
${data.datasetContext ? `\n\nCurrent dataset context:\n${data.datasetContext}` : ""}`;

    // Build Gemini conversation contents
    const contents = data.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (res.status === 429) throw new Error("AI rate limit reached. Please try again in a moment.");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini error ${res.status}: ${text.slice(0, 300)}`);
    }

    const json = await res.json();
    const reply =
      json.candidates?.[0]?.content?.parts?.[0]?.text ?? "No response from AI.";

    return { reply };
  });
