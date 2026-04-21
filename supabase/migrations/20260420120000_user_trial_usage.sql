-- user_trial_usage: registra one-time lifetime que un user_id activo su trial.
-- Inmutable: no se borra jamas, ni siquiera al revocar suscripcion.

CREATE TABLE IF NOT EXISTS public.user_trial_usage (
  user_id TEXT PRIMARY KEY,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_trial_usage ENABLE ROW LEVEL SECURITY;

-- Mismo patron que las tablas publicas: anon puede leer e insertar.
-- No hay UPDATE ni DELETE policy → inmutable para clientes.
DROP POLICY IF EXISTS "anon_select_user_trial_usage" ON public.user_trial_usage;
CREATE POLICY "anon_select_user_trial_usage"
  ON public.user_trial_usage
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon_insert_user_trial_usage" ON public.user_trial_usage;
CREATE POLICY "anon_insert_user_trial_usage"
  ON public.user_trial_usage
  FOR INSERT
  TO anon
  WITH CHECK (true);
