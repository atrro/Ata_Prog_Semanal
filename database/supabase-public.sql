BEGIN;

-- Access uses one shared password, checked on the server. Only a bcrypt hash is stored,
-- in a table that anon and authenticated roles cannot read.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Remove the GitHub-account model from earlier versions.
DROP POLICY IF EXISTS admin_self_read ON public.wp_admins;
DROP TABLE IF EXISTS public.wp_admins;
DROP FUNCTION IF EXISTS public.wp_is_admin();

CREATE TABLE IF NOT EXISTS public.wp_access (
  id text PRIMARY KEY CHECK(id='public'),
  password_hash text NOT NULL
);
ALTER TABLE public.wp_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wp_access FROM PUBLIC,anon,authenticated;

-- Sets or replaces the shared password. Run manually in the Supabase SQL Editor.
CREATE OR REPLACE FUNCTION public.wp_set_access_password(new_password text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF new_password IS NULL OR length(new_password) < 12 THEN
    RAISE EXCEPTION 'Access password must have at least 12 characters' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.wp_access(id,password_hash)
  VALUES('public', extensions.crypt(new_password, extensions.gen_salt('bf', 12)))
  ON CONFLICT (id) DO UPDATE SET password_hash=EXCLUDED.password_hash;
END;
$$;
REVOKE ALL ON FUNCTION public.wp_set_access_password(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wp_require_access(access_password text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF access_password IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.wp_access
    WHERE id='public' AND password_hash=extensions.crypt(access_password, password_hash)
  ) THEN
    RAISE EXCEPTION 'Invalid access password' USING ERRCODE='42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.wp_require_access(text) FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.wp_workspace (
  id text PRIMARY KEY CHECK(id='public'),
  revision bigint NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{"minutes":[],"parks":[]}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(jsonb_typeof(data->'minutes')='array' AND jsonb_typeof(data->'parks')='array'),
  CHECK(octet_length(data::text)<=20971520)
);
INSERT INTO public.wp_workspace(id) VALUES('public') ON CONFLICT DO NOTHING;
ALTER TABLE public.wp_workspace ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_read ON public.wp_workspace;
DROP POLICY IF EXISTS owner_read ON public.wp_workspace;
REVOKE ALL ON public.wp_workspace FROM PUBLIC,anon,authenticated;

-- Workspace reads and writes go only through functions that check the shared password.
CREATE OR REPLACE FUNCTION public.wp_load_workspace(access_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.wp_require_access(access_password);
  RETURN (SELECT jsonb_build_object('data',data,'revision',revision) FROM public.wp_workspace WHERE id='public');
END;
$$;
REVOKE ALL ON FUNCTION public.wp_load_workspace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wp_load_workspace(text) TO anon,authenticated;

CREATE TABLE IF NOT EXISTS public.wp_public_history (
  revision bigint PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wp_public_history DROP COLUMN IF EXISTS actor_id;
ALTER TABLE public.wp_public_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_history_read ON public.wp_public_history;
REVOKE ALL ON public.wp_public_history FROM PUBLIC,anon,authenticated;

DROP FUNCTION IF EXISTS public.save_wp_workspace(bigint,jsonb);
CREATE OR REPLACE FUNCTION public.save_wp_workspace(access_password text,expected_revision bigint,payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_revision bigint;
BEGIN
  PERFORM public.wp_require_access(access_password);
  IF payload IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(payload->'minutes') IS DISTINCT FROM 'array'
    OR jsonb_typeof(payload->'parks') IS DISTINCT FROM 'array'
    OR octet_length(payload::text)>20971520 THEN
    RAISE EXCEPTION 'Invalid workspace payload' USING ERRCODE='22023';
  END IF;
  SELECT revision INTO current_revision FROM public.wp_workspace WHERE id='public' FOR UPDATE;
  IF current_revision IS DISTINCT FROM expected_revision THEN
    RAISE EXCEPTION 'Workspace modified by another session' USING ERRCODE='40001';
  END IF;
  UPDATE public.wp_workspace SET data=payload,revision=revision+1,updated_at=now() WHERE id='public';
  INSERT INTO public.wp_public_history(revision,data) VALUES(current_revision+1,payload);
  RETURN current_revision+1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_wp_workspace(text,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_wp_workspace(text,bigint,jsonb) TO anon,authenticated;

-- Each park is a logical folder; minutes and attachments belong to it by parkId.
WITH folder_names AS (
  SELECT name, position FROM unnest(ARRAY[
    'Alegria', 'Amontada', 'Angicos', 'Aroeira', 'Assuruá', 'Aventura',
    'Babilônia Centro', 'Babilônia Sul CDV', 'Cabeço Preto', 'Caldeirão',
    'Campo Largo', 'Catanduba', 'CGN', 'Copel', 'Cumaru', 'DELFINA',
    'Dom Inocêncio', 'Elera', 'Esquina do Vento', 'Folha Larga CDV',
    'Folha Larga Norte', 'Gargaú', 'Gravatá', 'Honda', 'Icaraí', 'Jerusalém',
    'Kairós', 'Macambira', 'Monte verde', 'Morro do Chapeu I', 'Morro do Chapeu II',
    'Mundo Novo', 'Novo Horizonte', 'Ouro Branco', 'Pedra do Reino',
    'Pedra Pintada', 'Pedra Rajada', 'Riachão', 'Rio do Vento Expansão',
    'Rio do Vento II', 'Santa Rosa Mundo Novo', 'Sento Sé', 'Seridó',
    'Serra das Almas', 'Serra das Vacas', 'Serra do Assuruá', 'Serra do Tigre',
    'Serrote e Serra do Mato', 'Taiba', 'Umari', 'Ventos da Bahia',
    'Ventos do Piauí', 'Vilas', 'Vilas IV'
  ]) WITH ORDINALITY AS folders(name, position)
), missing_folders AS (
  SELECT jsonb_agg(jsonb_build_object(
    'id', 'folder-' || md5(name), 'name', name, 'client', '', 'region', '',
    'state', '', 'capacity', 0, 'manager', '', 'turbines', 0
  ) ORDER BY position) AS folders
  FROM folder_names
  WHERE NOT EXISTS (
    SELECT 1 FROM public.wp_workspace,
      jsonb_array_elements(data->'parks') AS park
    WHERE id='public' AND park->>'name'=folder_names.name
  )
)
UPDATE public.wp_workspace
SET data=jsonb_set(data, '{parks}', (data->'parks') || missing_folders.folders),
  revision=revision+1, updated_at=now()
FROM missing_folders
WHERE id='public' AND missing_folders.folders IS NOT NULL;

COMMIT;