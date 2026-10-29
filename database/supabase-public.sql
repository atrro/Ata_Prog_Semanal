BEGIN;

CREATE TABLE IF NOT EXISTS public.wp_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.wp_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_self_read ON public.wp_admins FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.wp_admins FROM PUBLIC,anon,authenticated;
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
CREATE POLICY public_read ON public.wp_workspace FOR SELECT TO anon,authenticated USING(id='public');
REVOKE ALL ON public.wp_workspace FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wp_workspace TO anon,authenticated;

CREATE TABLE IF NOT EXISTS public.wp_public_history (
  revision bigint PRIMARY KEY,
  actor_id uuid NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wp_public_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_history_read ON public.wp_public_history FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.wp_admins WHERE user_id=auth.uid()));
REVOKE ALL ON public.wp_public_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.wp_public_history TO authenticated;

CREATE OR REPLACE FUNCTION public.save_wp_workspace(expected_revision bigint,payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_revision bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.wp_admins WHERE user_id=auth.uid()) THEN
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

COMMIT;