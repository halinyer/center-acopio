-- ==============================================================================
-- ACOPIOVEN - SEGURIDAD DE DATOS DE CONTACTOS (BACKEND)
-- ==============================================================================
-- Propósito: Ocultar el número de teléfono (`leader_phone`) a los usuarios
-- que no hayan iniciado sesión, directamente desde la base de datos para evitar
-- robos de datos (scrapping) a través de peticiones HTTP.
-- ==============================================================================

-- 1. Crear la Vista Segura
CREATE OR REPLACE VIEW public.locations_secure AS
SELECT 
  id, 
  name, 
  type, 
  needs, 
  address, 
  lat, 
  lng, 
  leader_name,
  -- APLICAR LA BARRERA DE SEGURIDAD AQUÍ:
  -- Si el usuario está logueado (auth.uid() no es nulo), mostrar el teléfono.
  -- Si es un visitante anónimo y hay teléfono, retornar 'LOCKED'.
  -- Si no hay teléfono, retornar NULL.
  CASE 
    WHEN leader_phone IS NULL THEN NULL
    WHEN auth.uid() IS NOT NULL THEN leader_phone 
    ELSE 'LOCKED'
  END AS leader_phone,
  photo_url, 
  created_by, 
  updated_at, 
  is_active, 
  expires_at
FROM public.locations;

-- 2. Otorgar permisos de lectura a la vista
-- Nota: Supabase por defecto revoca los permisos en vistas nuevas, así que debemos
-- darlos explícitamente a los roles anónimo y autenticado.
GRANT SELECT ON public.locations_secure TO anon, authenticated;
