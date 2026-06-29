-- 1. Añadir columna expires_at
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2. Modificar la vista global_stats para ignorar caducados
DROP MATERIALIZED VIEW IF EXISTS public.global_stats CASCADE;
CREATE OR REPLACE VIEW public.global_stats AS
SELECT 
  (SELECT count(*) FROM public.locations WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())) as centros_operativos,
  (SELECT count(*) FROM public.validations WHERE created_at >= NOW() - INTERVAL '24 hours') as validaciones_24h;

-- 3. Actualizar función RPC para agregar ubicación
CREATE OR REPLACE FUNCTION public.add_location_secure(
    p_name text,
    p_type text,
    p_needs text,
    p_address text,
    p_lat double precision,
    p_lng double precision,
    p_leader_name text,
    p_leader_phone text,
    p_auth_code text,
    p_expires_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    IF p_auth_code != 'SOS-VZLA-2026' THEN
        RAISE EXCEPTION 'Código de autorización inválido';
    END IF;

    INSERT INTO public.locations (
        name, type, needs, address, lat, lng,
        leader_name, leader_phone, is_active, updated_at, expires_at
    ) VALUES (
        p_name, p_type, p_needs, p_address, p_lat, p_lng,
        p_leader_name, p_leader_phone, true, NOW(), p_expires_at
    );
END;
$$;

-- 4. Actualizar función RPC para editar ubicación
CREATE OR REPLACE FUNCTION public.edit_location_secure(
    p_id uuid,
    p_name text,
    p_type text,
    p_needs text,
    p_leader_name text,
    p_leader_phone text,
    p_auth_code text,
    p_expires_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    IF p_auth_code != 'SOS-VZLA-2026' THEN
        RAISE EXCEPTION 'Código de autorización inválido';
    END IF;

    UPDATE public.locations
    SET 
        name = p_name,
        type = p_type,
        needs = p_needs,
        leader_name = p_leader_name,
        leader_phone = p_leader_phone,
        expires_at = p_expires_at,
        updated_at = NOW()
    WHERE id = p_id;
END;
$$;
