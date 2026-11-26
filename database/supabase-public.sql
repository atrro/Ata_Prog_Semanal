BEGIN;

-- Responsible accounts are GitHub logins (lowercase). Only the GitHub identity
-- linked to the Supabase user is trusted, never user-editable metadata.
CREATE TABLE IF NOT EXISTS public.wp_admins (
  github_login text PRIMARY KEY CHECK(github_login=lower(github_login) AND github_login ~ '^[a-z0-9][a-z0-9-]{0,38}$')
);
-- Migration from the e-mail model: keep only GitHub-login rows, drop the old user_id.
ALTER TABLE public.wp_admins ADD COLUMN IF NOT EXISTS github_login text;
DELETE FROM public.wp_admins WHERE github_login IS NULL;
ALTER TABLE public.wp_admins DROP COLUMN IF EXISTS user_id CASCADE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.wp_admins'::regclass AND contype='p') THEN
    ALTER TABLE public.wp_admins ADD PRIMARY KEY (github_login);
  END IF;
END $$;
ALTER TABLE public.wp_admins ENABLE ROW LEVEL SECURITY;
-- A constant unique key allows at most one responsible account.
CREATE UNIQUE INDEX IF NOT EXISTS wp_single_admin ON public.wp_admins ((true));
REVOKE ALL ON public.wp_admins FROM PUBLIC,anon,authenticated;

-- True when the caller signed in with GitHub and the login matches an admin row.
CREATE OR REPLACE FUNCTION public.wp_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS(
    SELECT 1
    FROM auth.identities i
    JOIN public.wp_admins a ON a.github_login=lower(i.identity_data->>'user_name')
    WHERE i.user_id=auth.uid() AND i.provider='github'
  );
$$;
REVOKE ALL ON FUNCTION public.wp_is_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.wp_is_admin() TO authenticated;
DROP POLICY IF EXISTS admin_self_read ON public.wp_admins;
CREATE POLICY admin_self_read ON public.wp_admins FOR SELECT TO authenticated USING(public.wp_is_admin());
GRANT SELECT ON public.wp_admins TO authenticated;

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
CREATE POLICY owner_read ON public.wp_workspace FOR SELECT TO authenticated
  USING(id='public' AND public.wp_is_admin());
REVOKE ALL ON public.wp_workspace FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wp_workspace TO authenticated;

CREATE TABLE IF NOT EXISTS public.wp_public_history (
  revision bigint PRIMARY KEY,
  actor_id uuid NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wp_public_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_history_read ON public.wp_public_history;
CREATE POLICY admin_history_read ON public.wp_public_history FOR SELECT TO authenticated
  USING(public.wp_is_admin());
REVOKE ALL ON public.wp_public_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wp_public_history TO authenticated;

CREATE OR REPLACE FUNCTION public.save_wp_workspace(expected_revision bigint,payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_revision bigint;
BEGIN
  IF NOT public.wp_is_admin() THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501';
  END IF;
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
  INSERT INTO public.wp_public_history(revision,actor_id,data) VALUES(current_revision+1,auth.uid(),payload);
  RETURN current_revision+1;
END;
$$;
REVOKE ALL ON FUNCTION public.save_wp_workspace(bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_wp_workspace(bigint,jsonb) TO authenticated;

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