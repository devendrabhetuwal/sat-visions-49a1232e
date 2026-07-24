
-- 1) ai_usage: add explicit deny-by-default write policies scoped to owner.
--    All client writes are blocked; only service_role (used by server functions) can write.
DROP POLICY IF EXISTS "Deny client inserts on ai_usage" ON public.ai_usage;
DROP POLICY IF EXISTS "Deny client updates on ai_usage" ON public.ai_usage;
DROP POLICY IF EXISTS "Deny client deletes on ai_usage" ON public.ai_usage;

CREATE POLICY "Deny client inserts on ai_usage"
  ON public.ai_usage FOR INSERT TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "Deny client updates on ai_usage"
  ON public.ai_usage FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny client deletes on ai_usage"
  ON public.ai_usage FOR DELETE TO authenticated, anon
  USING (false);

-- Ensure only authenticated users can even attempt writes at the grant layer.
REVOKE INSERT, UPDATE, DELETE ON public.ai_usage FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_usage FROM authenticated;
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

-- 2) Revoke public/anon EXECUTE on SECURITY DEFINER functions.
--    has_role must remain callable by authenticated (used in RLS policies via the
--    caller, plus direct queries). set_updated_at and grant_admin_for_designated_email
--    are trigger functions and don't need any role-level EXECUTE.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_admin_for_designated_email() FROM PUBLIC, anon, authenticated;
