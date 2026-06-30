-- ==========================================
-- ACOPIOVEN - TACTICAL FEED (FASE 2)
-- Protocolo Amnesia y Radar Táctico
-- ==========================================

-- 0. Habilitar extensión UUID (Requisito previo)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla Base (Acopios/Centros)
CREATE TABLE IF NOT EXISTS public.acopios (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('hospital', 'centro_acopio', 'iglesia')),
    address TEXT,
    needs TEXT,
    leader_name TEXT,
    leader_phone TEXT,
    photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.acopios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acopios visibles para todos" ON public.acopios;
CREATE POLICY "Acopios visibles para todos" ON public.acopios FOR SELECT USING (true);

-- 2. Tabla Principal (Feed Táctico)
CREATE TABLE IF NOT EXISTS public.tactical_feed (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_avatar TEXT,
    content TEXT NOT NULL CHECK (char_length(content) <= 280),
    is_critical BOOLEAN DEFAULT false,
    contact_phone TEXT,
    image_url TEXT,
    linked_center_id UUID REFERENCES public.acopios(id) ON DELETE SET NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    zone TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    supports_count INTEGER DEFAULT 0
);

-- Habilitar RLS
ALTER TABLE public.tactical_feed ENABLE ROW LEVEL SECURITY;

-- Añadir a Realtime para WebSockets (ignorar si ya existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'tactical_feed'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tactical_feed;
  END IF;
END $$;

-- Políticas
DROP POLICY IF EXISTS "Reportes visibles para todos" ON public.tactical_feed;
CREATE POLICY "Reportes visibles para todos" ON public.tactical_feed
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados pueden insertar" ON public.tactical_feed;
CREATE POLICY "Usuarios autenticados pueden insertar" ON public.tactical_feed
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. Amnesia Protocol (Purga automática a las 48 horas)
-- Esto garantiza que el mapa no se llene de ruido o alertas obsoletas.
CREATE OR REPLACE FUNCTION purge_old_tactical_reports()
RETURNS trigger AS $$
BEGIN
    DELETE FROM public.tactical_feed 
    WHERE created_at < NOW() - INTERVAL '48 hours';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_purge_tactical_reports ON public.tactical_feed;
CREATE TRIGGER trigger_purge_tactical_reports
    AFTER INSERT ON public.tactical_feed
    EXECUTE FUNCTION purge_old_tactical_reports();

-- 3. Motor Híbrido 80/20 (Score de Relevancia + Cursor Compuesto)
CREATE OR REPLACE FUNCTION get_tactical_feed_radar(
    user_lat double precision,
    user_lng double precision,
    p_last_score integer DEFAULT NULL,
    p_last_time timestamp with time zone DEFAULT NULL,
    p_last_id uuid DEFAULT NULL,
    limit_size integer DEFAULT 15
)
RETURNS TABLE (
    id UUID,
    author_name TEXT,
    author_avatar TEXT,
    content TEXT,
    image_url TEXT,
    is_critical BOOLEAN,
    contact_phone TEXT,
    linked_center_id UUID,
    zone TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    supports_count INTEGER,
    distance_km double precision,
    relevance_score integer
) AS $$
BEGIN
    RETURN QUERY
    WITH scored_posts AS (
        SELECT 
            t.id, t.author_name, t.author_avatar, t.content, t.image_url, t.is_critical, t.contact_phone,
            t.linked_center_id, t.zone, t.created_at, t.supports_count,
            -- Fórmula Haversine para distancia en KM
            (6371 * acos(
                cos(radians(user_lat)) * cos(radians(t.lat)) *
                cos(radians(t.lng) - radians(user_lng)) +
                sin(radians(user_lat)) * sin(radians(t.lat))
            )) AS dist_km
        FROM public.tactical_feed t
        -- Amnesia estricta a nivel de BBDD
        WHERE t.created_at >= NOW() - INTERVAL '48 hours'
    ),
    final_posts AS (
        SELECT 
            sp.*,
            CASE 
                WHEN sp.is_critical = true AND sp.dist_km <= 20 THEN 4
                WHEN sp.is_critical = false AND sp.dist_km <= 20 THEN 3
                WHEN sp.is_critical = true AND sp.dist_km > 20 THEN 2
                ELSE 1
            END AS rel_score
        FROM scored_posts sp
    )
    SELECT 
        fp.id, fp.author_name, fp.author_avatar, fp.content, fp.image_url, fp.is_critical, fp.contact_phone,
        fp.linked_center_id, fp.zone, fp.created_at, fp.supports_count, fp.dist_km, fp.rel_score
    FROM final_posts fp
    WHERE 
        p_last_score IS NULL OR 
        (fp.rel_score, fp.created_at, fp.id) < (p_last_score, p_last_time, p_last_id)
    ORDER BY fp.rel_score DESC, fp.created_at DESC, fp.id DESC
    LIMIT limit_size;
END;
$$ LANGUAGE plpgsql;
