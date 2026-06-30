-- ==========================================
-- ACOPIOVEN - TACTICAL FEED (FASE 2)
-- Protocolo Amnesia y Radar Táctico
-- ==========================================

-- 1. Tabla Principal
CREATE TABLE IF NOT EXISTS public.tactical_feed (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    author_avatar TEXT,
    content TEXT NOT NULL CHECK (char_length(content) <= 280),
    is_critical BOOLEAN DEFAULT false,
    contact_phone TEXT,
    linked_center_id UUID REFERENCES public.acopios(id) ON DELETE SET NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    zone TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    supports_count INTEGER DEFAULT 0
);

-- Habilitar RLS
ALTER TABLE public.tactical_feed ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Reportes visibles para todos" ON public.tactical_feed
    FOR SELECT USING (true);

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

-- 3. Funciones Geográficas para el Radar (PostGIS no es estrictamente necesario si usamos Haversine en RPC)
CREATE OR REPLACE FUNCTION get_tactical_feed_radar(
    user_lat double precision,
    user_lng double precision,
    radius_km double precision DEFAULT 50.0
)
RETURNS TABLE (
    id UUID,
    author_name TEXT,
    author_avatar TEXT,
    content TEXT,
    is_critical BOOLEAN,
    contact_phone TEXT,
    linked_center_id UUID,
    zone TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    supports_count INTEGER,
    distance_km double precision
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id, t.author_name, t.author_avatar, t.content, t.is_critical, t.contact_phone,
        t.linked_center_id, t.zone, t.created_at, t.supports_count,
        -- Fórmula Haversine para distancia en KM
        (6371 * acos(
            cos(radians(user_lat)) * cos(radians(t.lat)) *
            cos(radians(t.lng) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(t.lat))
        )) AS distance_km
    FROM public.tactical_feed t
    WHERE 
        (6371 * acos(
            cos(radians(user_lat)) * cos(radians(t.lat)) *
            cos(radians(t.lng) - radians(user_lng)) +
            sin(radians(user_lat)) * sin(radians(t.lat))
        )) <= radius_km
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql;
