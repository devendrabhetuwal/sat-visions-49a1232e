
CREATE TABLE public.timeseries_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Time-series snapshot',
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.timeseries_shares TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeseries_shares TO authenticated;
GRANT ALL ON public.timeseries_shares TO service_role;

ALTER TABLE public.timeseries_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shares by link"
  ON public.timeseries_shares FOR SELECT
  USING (true);

CREATE POLICY "Owners can insert their shares"
  ON public.timeseries_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can update their shares"
  ON public.timeseries_shares FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can delete their shares"
  ON public.timeseries_shares FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
