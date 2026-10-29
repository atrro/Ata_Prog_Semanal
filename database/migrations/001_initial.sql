CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE companies (
  id uuid PRIMARY KEY,
  name varchar(200) NOT NULL,
  locale varchar(20) NOT NULL DEFAULT 'pt-BR',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  company_id uuid NOT NULL REFERENCES companies(id),
  id uuid NOT NULL,
  name varchar(200) NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('Administrador','Dispatcher','Leitor')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,id)
);
CREATE TABLE parks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  name varchar(200) NOT NULL,
  client varchar(200) NOT NULL,
  region varchar(100) NOT NULL,
  state varchar(100) NOT NULL,
  country char(2) NOT NULL DEFAULT 'BR',
  capacity numeric(12,2) NOT NULL CHECK(capacity>0),
  turbines integer NOT NULL CHECK(turbines>0),
  manager varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(company_id,id)
);
CREATE TABLE minutes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  park_id uuid NOT NULL,
  week smallint NOT NULL CHECK(week BETWEEN 1 AND 53),
  meeting_date date NOT NULL,
  dispatcher varchar(200) NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'Rascunho' CHECK(status IN ('Rascunho','Pendente','Enviada')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(company_id,id),
  FOREIGN KEY(company_id,park_id) REFERENCES parks(company_id,id)
);
CREATE TABLE minute_versions (
  company_id uuid NOT NULL,
  minute_id uuid NOT NULL,
  version integer NOT NULL,
  actor_id uuid,
  actor_name varchar(200) NOT NULL,
  action text NOT NULL,
  snapshot jsonb NOT NULL,
  sha256 char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,minute_id,version),
  FOREIGN KEY(company_id,minute_id) REFERENCES minutes(company_id,id)
);
CREATE TABLE attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  minute_id uuid NOT NULL,
  name varchar(200) NOT NULL,
  size bigint NOT NULL CHECK(size>0 AND size<=15728640),
  mime varchar(200) NOT NULL,
  blob_key text NOT NULL,
  sha256 char(64) NOT NULL,
  version integer NOT NULL CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY(company_id,id),
  UNIQUE(company_id,minute_id,name,version),
  FOREIGN KEY(company_id,minute_id) REFERENCES minutes(company_id,id)
);
CREATE TABLE delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  minute_id uuid NOT NULL,
  version integer NOT NULL,
  kind varchar(10) NOT NULL CHECK(kind IN ('EMAIL','TEAMS')),
  idempotency_key uuid NOT NULL,
  state varchar(12) NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','SENT','UNCERTAIN','CANCELLED')),
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(company_id,idempotency_key,kind),
  FOREIGN KEY(company_id,minute_id) REFERENCES minutes(company_id,id)
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  actor_id uuid,
  entity_id uuid NOT NULL,
  action varchar(100) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_minutes_recent ON minutes(company_id,meeting_date DESC,id) WHERE deleted_at IS NULL;
CREATE INDEX idx_minutes_park_week ON minutes(company_id,park_id,week,meeting_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_minutes_status ON minutes(company_id,status,meeting_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_minutes_dispatcher ON minutes(company_id,dispatcher) WHERE deleted_at IS NULL;
CREATE INDEX idx_parks_region ON parks(company_id,region) WHERE deleted_at IS NULL;
CREATE INDEX idx_attachments_minute ON attachments(company_id,minute_id,name,version DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_delivery_pending ON delivery_jobs(available_at,created_at) WHERE state='PENDING';
CREATE INDEX idx_delivery_history ON delivery_jobs(company_id,minute_id,created_at DESC);
CREATE INDEX idx_audit_company ON audit_events(company_id,entity_id,created_at DESC);

CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END;
$$;
CREATE TRIGGER immutable_versions BEFORE UPDATE OR DELETE ON minute_versions FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();