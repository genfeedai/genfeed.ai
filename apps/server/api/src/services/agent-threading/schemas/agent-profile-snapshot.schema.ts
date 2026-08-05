export interface AgentProfileSnapshotDocument {
  id: string;
  organizationId: string;
  threadId: string;
  [key: string]: unknown;
}
