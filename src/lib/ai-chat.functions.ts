import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() }))
    .min(1)
    .max(50),
  datasetContext: z.string().max(4000).optional(),
});

const FREE_LIMIT = 5;

export const getAiUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: usage }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("ai_usage").select("count").eq("user_id", context.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const isPremium = (roles ?? []).some((r: { role: string }) => r.role === "premium" || r.role === "admin");
    const count = usage?.count ?? 0;
    return {
      count,
      limit: FREE_LIMIT,
      isPremium,
      remaining: isPremium ? null : Math.max(0, FREE_LIMIT - count),
    };
  });

export const chatWithSatVision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isPremium = (roles ?? []).some(
      (r: { role: string }) => r.role === "premium" || r.role === "admin",
    );

    const { data: usage } = await supabaseAdmin
      .from("ai_usage")
      .select("count")
      .eq("user_id", context.userId)
      .maybeSingle();
    const currentCount = usage?.count ?? 0;

    if (!isPremium && currentCount >= FREE_LIMIT) {
      throw new Error(
        `Free plan limit reached (${FREE_LIMIT} AI messages). Upgrade to Premium for unlimited AI assistance.`,
      );
    }

    const systemPrompt = `You are SatVision AI, an expert remote-sensing and geospatial analyst.
You help users interpret satellite datasets, NDVI/NDWI, cloud coverage, vegetation and water indices,
land-cover, and atmospheric/ocean data. Be concise, scientific, and use markdown when helpful.
${data.datasetContext ? `\n\nCurrent dataset context:\n${data.datasetContext}` : ""}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...data.messages],
      }),
    });

    if (res.status === 429) throw new Error("AI rate limit reached. Please try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in your workspace.");
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI error ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    const reply = json.choices?.[0]?.message?.content ?? "";

    const newCount = currentCount + 1;
    await supabaseAdmin
      .from("ai_usage")
      .upsert({ user_id: context.userId, count: newCount, updated_at: new Date().toISOString() });

    return {
      reply,
      usage: {
        count: newCount,
        limit: FREE_LIMIT,
        isPremium,
        remaining: isPremium ? null : Math.max(0, FREE_LIMIT - newCount),
      },
    };
  });
