DROP TABLE IF EXISTS assessments, request_events, messages, requests, residents, units, communities CASCADE;

CREATE TABLE communities (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  config      JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE units (
  id            SERIAL PRIMARY KEY,
  community_id  TEXT NOT NULL REFERENCES communities(id),
  flat_no       TEXT NOT NULL,
  owner_name    TEXT NOT NULL,
  pending_dues  NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE (community_id, flat_no)
);

-- demo personas (stand-in for real auth)
CREATE TABLE residents (
  id            SERIAL PRIMARY KEY,
  community_id  TEXT NOT NULL REFERENCES communities(id),
  name          TEXT NOT NULL,
  phone         TEXT
);

CREATE TABLE requests (
  id             SERIAL PRIMARY KEY,
  community_id   TEXT NOT NULL REFERENCES communities(id),
  resident_id    INT NOT NULL REFERENCES residents(id),
  unit_id        INT REFERENCES units(id),
  type           TEXT CHECK (type IN ('move_in','move_out')),
  resident_type  TEXT CHECK (resident_type IN ('owner','tenant')),
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','submitted','info_requested','approved','rejected')),
  move_date      DATE,
  slot           TEXT,
  data           JSONB NOT NULL DEFAULT '{}',   -- members, vehicles, extra fields
  documents      JSONB NOT NULL DEFAULT '[]',   -- [{key, filename, uploadedAt}]
  admin_note     TEXT,                          -- reason / info requested
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  submitted_at   TIMESTAMPTZ
);
CREATE INDEX idx_requests_slot ON requests (community_id, move_date, slot, status);

-- raw OpenAI message objects, so the agent can resume a conversation
CREATE TABLE messages (
  id          SERIAL PRIMARY KEY,
  request_id  INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE request_events (
  id          SERIAL PRIMARY KEY,
  request_id  INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  actor       TEXT NOT NULL CHECK (actor IN ('resident','admin','agent','system')),
  event       TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE assessments (
  id              SERIAL PRIMARY KEY,
  request_id      INT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  rule_results    JSONB NOT NULL,
  summary         TEXT,
  risk_level      TEXT CHECK (risk_level IN ('low','medium','high')),
  risks           JSONB NOT NULL DEFAULT '[]',
  recommendation  TEXT CHECK (recommendation IN ('approve','reject','request_info')),
  reasoning       TEXT,
  message_to_resident TEXT,
  model           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
