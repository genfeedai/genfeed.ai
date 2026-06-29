ALTER TABLE desktop_workspace
  ADD COLUMN IF NOT EXISTS linked_organization_id TEXT;

ALTER TABLE desktop_brand
  ADD COLUMN IF NOT EXISTS cloud_organization_id TEXT;

CREATE INDEX IF NOT EXISTS idx_desktop_brand_cloud_org_updated
  ON desktop_brand (cloud_organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS desktop_device_identity (
  id TEXT PRIMARY KEY,
  local_user_id TEXT NOT NULL,
  cloud_user_id TEXT,
  cloud_user_email TEXT,
  status TEXT NOT NULL DEFAULT 'never-connected',
  connected_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desktop_device_identity_cloud_user
  ON desktop_device_identity (cloud_user_id);

CREATE TABLE IF NOT EXISTS desktop_cloud_organization (
  cloud_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  role TEXT,
  last_pulled_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desktop_cloud_organization_slug
  ON desktop_cloud_organization (slug);

CREATE TABLE IF NOT EXISTS desktop_workspace_cloud_link (
  workspace_id TEXT PRIMARY KEY
    REFERENCES desktop_workspace (id) ON DELETE CASCADE,
  local_user_id TEXT NOT NULL,
  local_device_id TEXT NOT NULL,
  cloud_user_id TEXT,
  cloud_organization_id TEXT,
  cloud_brand_id TEXT,
  cloud_project_id TEXT,
  sync_policy TEXT NOT NULL DEFAULT 'local-only',
  linked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desktop_workspace_cloud_link_cloud_org
  ON desktop_workspace_cloud_link (cloud_organization_id);
CREATE INDEX IF NOT EXISTS idx_desktop_workspace_cloud_link_cloud_brand
  ON desktop_workspace_cloud_link (cloud_brand_id);
CREATE INDEX IF NOT EXISTS idx_desktop_workspace_cloud_link_cloud_project
  ON desktop_workspace_cloud_link (cloud_project_id);
