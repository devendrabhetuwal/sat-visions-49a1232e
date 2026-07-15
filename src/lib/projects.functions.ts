import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BBox = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  file_name: z.string().min(1).max(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bands: z.number().int().positive(),
  bbox: BBox,
  epsg: z.number().int().optional().nullable(),
  projected: z.boolean(),
  last_index: z.string().max(40).optional().nullable(),
  last_stats: z.record(z.string(), z.unknown()).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, name, file_name, width, height, bands, epsg, projected, last_index, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = { ...data, user_id: context.userId };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("projects")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });