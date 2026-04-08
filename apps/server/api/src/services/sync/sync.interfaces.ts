export interface CloudSyncMetadata {
  lastSyncedAt: Date;
  remoteAccountId: string;
  remoteId: string;
  remoteOrgId: string;
  syncDirection: 'push' | 'pull';
}

export interface SyncStatusResponse {
  isConnected: boolean;
  mode: string;
  syncableWorkflows: number;
  syncedWorkflows: number;
}

export interface PushWorkflowResponse {
  cloudSync: CloudSyncMetadata;
  localId: string;
  remoteId: string;
}

export interface PullWorkflowResponse {
  cloudSync: CloudSyncMetadata;
  localId: string;
  remoteId: string;
}
