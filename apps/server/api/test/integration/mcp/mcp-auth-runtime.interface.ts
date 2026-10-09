export type McpRuntimeActorLabel = 'U' | 'V' | 'W' | 'Z';
export interface McpRuntimeActor {
  id: string;
  memberId: string;
  email: string;
  password: string;
}
export interface McpRuntimeFixture {
  organizationId: string;
  foreignOrganizationId: string;
  brands: { A: string; B: string; D: string; X: string; missing: string };
  actors: Record<McpRuntimeActorLabel, McpRuntimeActor>;
  ordinaryRoleId: string;
}
export interface McpRuntimeCase {
  id: string;
  status: 'passed';
}
export interface McpRuntimeJourneyReport {
  version: 1;
  candidateSha: string;
  testedSha: string;
  nonce: string;
  cases: McpRuntimeCase[];
  migrationInventoryDigest: string;
  negativeStateDigest: string;
  cacheObserved: boolean;
}
