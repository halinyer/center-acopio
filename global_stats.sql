-- 1. Crear la vista que consolida la data táctica en una sola fila
CREATE MATERIALIZED VIEW IF NOT EXISTS public.global_stats AS
SELECT 
  (SELECT count(*) FROM public.locations WHERE is_active = true) as centros_operativos,
  (SELECT count(*) FROM public.validations WHERE created_at >= NOW() - INTERVAL '24 hours') as validaciones_24h
WITH DATA;

-- 2. Asegurar acceso rápido indexado (única fila)
CREATE UNIQUE INDEX IF NOT EXISTS global_stats_idx ON public.global_stats (centros_operativos);

-- 3. Programar la actualización en segundo plano con pg_cron
-- Nota: Para que pg_cron funcione en Supabase, asegúrate de tener la extensión habilitada en la sección Database -> Extensions.
SELECT cron.schedule(
  'actualizar-marcador-global',
  '*/5 * * * *', -- Cada 5 minutos exacta
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.global_stats; $$
);
