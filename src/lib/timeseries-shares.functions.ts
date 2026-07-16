import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Stats = z.object({
  min: z.number(),
  mean: z.number(),
  max: z.number(),
});

const BBox = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const SceneSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  date: z.string(),
  bands: z.number().int().positive(),
  ndvi: Stats,
  ndwi: Stats,
  ndbi: Stats,
  bbox: BBox,
  bboxLatLng: BBox.nullable(),
  epsg: z.number().int().optional().nullable(),
});

const PayloadSchema = z.object({
  version: z.literal(1),
  bandMapping: z.object({
    red: z.number().int().nonnegative(),
    green: z.number().int().nonnegative(),
    nir: z.number().int().nonnegative(),
    swir: z.number().int().nonnegative(),
  }),
  activeIndex: z.enum(["ndvi", "ndwi", "ndbi"]),
  scenes: z.array(SceneSchema).min(1).max(200),
});

export type TimeseriesSharePayload = z.infer<typeof PayloadSchema>;

export const createTimeseriesShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        title: z.string().min(1).max(200).optional(),
        payload: PayloadSchema,
      })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("timeseries_shares")
      .insert({
        user_id: context.userId,
        title: data.title ?? "Time-series snapshot",
        payload: data.payload,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const getTimeseriesShare = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("timeseries_shares")
      .select("id, title, payload, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Share not found");
    const parsed = PayloadSchema.safeParse(row.payload);
    if (!parsed.success) throw new Error("Share payload is invalid");
    return {
      id: row.id as string,
      title: row.title as string,
      created_at: row.created_at as string,
      payload: parsed.data,
    };
  });