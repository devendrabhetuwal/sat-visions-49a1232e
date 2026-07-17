
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'premium';

CREATE TABLE public.ai_usage (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI usage" ON public.ai_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
