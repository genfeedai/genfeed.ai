CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  clerk_id TEXT UNIQUE,
  email TEXT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users (organization_id);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  workspace_id TEXT,
  platform TEXT NOT NULL,
  type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  publish_intent TEXT,
  source_draft_id TEXT UNIQUE,
  source_trend_id TEXT,
  source_trend_topic TEXT,
  published_at TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  engagements INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_organization_updated ON posts (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_status_published ON posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_platform_updated ON posts (platform, updated_at DESC);

CREATE TABLE IF NOT EXISTS ingredients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  platform TEXT,
  total_votes INTEGER NOT NULL DEFAULT 0,
  source_post_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingredients_org_updated ON ingredients (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingredients_platform_votes ON ingredients (platform, total_votes DESC);

CREATE TABLE IF NOT EXISTS trends (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  topic TEXT NOT NULL,
  summary TEXT,
  virality_score INTEGER NOT NULL,
  engagement_score INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trends_org_platform_topic ON trends (organization_id, platform, topic);

CREATE TABLE IF NOT EXISTS agent_strategies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar TEXT,
  platforms_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_strategies_org_updated ON agent_strategies (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  lifecycle TEXT NOT NULL,
  node_count INTEGER NOT NULL,
  supports_batch BOOLEAN NOT NULL DEFAULT FALSE,
  last_executed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workflows_org_updated ON workflows (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows (id) ON DELETE CASCADE,
  agent_strategy_id TEXT REFERENCES agent_strategies (id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_started ON workflow_executions (workflow_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_agent_started ON workflow_executions (agent_strategy_id, started_at DESC);

CREATE TABLE IF NOT EXISTS desktop_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS desktop_workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  linked_project_id TEXT,
  linked_brand_id TEXT,
  sync_policy TEXT NOT NULL DEFAULT 'local-only',
  file_index TEXT NOT NULL DEFAULT '[]',
  indexing_state TEXT NOT NULL DEFAULT 'idle',
  local_draft_count INTEGER NOT NULL DEFAULT 0,
  pending_sync_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desktop_workspace_last_opened_at ON desktop_workspace (last_opened_at DESC);

CREATE TABLE IF NOT EXISTS desktop_brand (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  cloud_id TEXT UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sync_policy TEXT NOT NULL DEFAULT 'none',
  cloud_version TEXT,
  last_pulled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_desktop_brand_org_updated ON desktop_brand (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS desktop_asset (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  brand_id TEXT,
  workspace_id TEXT,
  cloud_id TEXT UNIQUE,
  cloud_object_key TEXT,
  local_path TEXT,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  origin TEXT NOT NULL,
  residency TEXT NOT NULL,
  upload_policy TEXT NOT NULL DEFAULT 'never',
  original_file_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desktop_asset_hash_size ON desktop_asset (sha256, size_bytes);
CREATE INDEX IF NOT EXISTS idx_desktop_asset_org_updated ON desktop_asset (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_desktop_asset_brand_updated ON desktop_asset (brand_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_desktop_asset_workspace_updated ON desktop_asset (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_desktop_asset_residency_updated ON desktop_asset (residency, updated_at DESC);

CREATE TABLE IF NOT EXISTS desktop_sync_op (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  base_version TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_desktop_sync_op_status_updated ON desktop_sync_op (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_desktop_sync_op_workspace_status_updated ON desktop_sync_op (workspace_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_desktop_sync_op_entity ON desktop_sync_op (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS desktop_sync_job (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desktop_sync_job_workspace_updated ON desktop_sync_job (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_desktop_sync_job_status_updated ON desktop_sync_job (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS desktop_recent_item (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  opened_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desktop_recent_item_opened_at ON desktop_recent_item (opened_at DESC);
