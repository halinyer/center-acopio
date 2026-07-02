-- ==============================================================================
-- ACOPIOVEN - AUTENTICACIÓN EN BITÁCORA (DESNORMALIZACIÓN)
-- ==============================================================================
-- Añadimos las columnas para almacenar permanentemente la foto y nombre del 
-- voluntario junto a su mensaje. Esto es mucho más rápido que hacer JOINs.
-- ==============================================================================

ALTER TABLE public.ephemeral_notes
ADD COLUMN IF NOT EXISTS user_name text,
ADD COLUMN IF NOT EXISTS user_avatar text;
