/**
 * Scale model for the database load suite.
 *
 * `1x` is a small but real deployment: BASE_TENANTS organisations, each with
 * the per-tenant fan-out below, plus one "whale" organisation. Two dimensions
 * scale together so both failure families surface:
 *
 *  - breadth: tenant count = BASE_TENANTS * scale. Table sizes grow, per-tenant
 *    shape stays the same. Exposes cross-tenant scans, missing global indexes,
 *    cron sweeps that read every tenant.
 *  - depth: the whale organisation's fan-out = base fan-out * scale. Exposes
 *    deep OFFSET pagination, unbounded `count(*)`, sorts over a large tenant.
 *
 * Every relationship scales with these two factors because every child count
 * is expressed per organisation (and per parent where it hangs off one).
 */
export const SCALES = [1, 10, 100, 1000] as const;
export type Scale = (typeof SCALES)[number];

export const BASE_TENANTS = 10;

/** Rows created per organisation at 1x. Children of children are per-parent. */
export const FANOUT = {
  activities: 120,
  agentMessagesPerThread: 15,
  agentThreads: 6,
  articles: 10,
  assets: 40,
  brands: 2,
  creditTransactions: 80,
  credentialsPerBrand: 3,
  folders: 5,
  ingredients: 150,
  inboxItemsPerMember: 20,
  members: 3,
  nodeResultsPerExecution: 5,
  postAnalyticsPerPublishedPost: 6,
  posts: 60,
  tasks: 15,
  workflowExecutions: 30,
  workflows: 3,
} as const;

export const WHALE_ORG_INDEX = 0;

export function tenantCount(scale: number): number {
  return BASE_TENANTS * scale;
}

export function databaseNameFor(scale: number): string {
  return `genfeed_loadtest_${scale}x`;
}
