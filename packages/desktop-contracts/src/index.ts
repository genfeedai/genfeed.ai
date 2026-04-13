/* ─── Desktop IPC Channel Names ─── */

export const DESKTOP_IPC_CHANNELS = {
  appBootstrap: 'desktop:app:bootstrap',
  appGetDiagnostics: 'desktop:app:getDiagnostics',
  authChanged: 'desktop:auth:changed',
  authGetSession: 'desktop:auth:getSession',
  authLogin: 'desktop:auth:login',
  authLogout: 'desktop:auth:logout',
  bootstrapChanged: 'desktop:bootstrap:changed',
  cacheGetPath: 'desktop:cache:getPath',
  cacheWriteAsset: 'desktop:cache:writeAsset',
  cloudGenerateContent: 'desktop:cloud:generateContent',
  cloudGenerateHooks: 'desktop:cloud:generateHooks',
  cloudGetAnalytics: 'desktop:cloud:getAnalytics',
  cloudGetIngredients: 'desktop:cloud:getIngredients',
  cloudGetTrends: 'desktop:cloud:getTrends',
  cloudListAgents: 'desktop:cloud:listAgents',
  cloudListProjects: 'desktop:cloud:listProjects',
  cloudListWorkflows: 'desktop:cloud:listWorkflows',
  cloudPublishPost: 'desktop:cloud:publishPost',
  cloudRunAgent: 'desktop:cloud:runAgent',
  cloudRunWorkflow: 'desktop:cloud:runWorkflow',
  draftsDelete: 'desktop:drafts:delete',
  draftsGet: 'desktop:drafts:get',
  draftsList: 'desktop:drafts:list',
  draftsSave: 'desktop:drafts:save',
  filesImportAssets: 'desktop:files:importAssets',
  filesRead: 'desktop:files:read',
  filesWrite: 'desktop:files:write',
  getPlatform: 'desktop:getPlatform',
  notify: 'desktop:notify',
  openFileDialog: 'desktop:openFileDialog',
  quickGenerate: 'desktop:quickGenerate',
  syncGetJobs: 'desktop:sync:getJobs',
  syncGetState: 'desktop:sync:getState',
  syncQueueJob: 'desktop:sync:queueJob',
  toggleSidebar: 'desktop:view:toggleSidebar',
  workspaceLinkProject: 'desktop:workspace:linkProject',
  workspaceOpen: 'desktop:workspace:open',
  workspaceRead: 'desktop:workspace:read',
  workspaceRecent: 'desktop:workspace:recent',
  workspaceReveal: 'desktop:workspace:reveal',
} as const;

/* ─── Environment ─── */

export interface IDesktopEnvironment {
  apiEndpoint: string;
  appEndpoint: string;
  appName: string;
  appPort: number;
  authEndpoint: string;
  cdnUrl: string;
  sessionDbPath?: string;
  sentryDsn?: string;
  sentryEnvironment?: string;
  sentryRelease?: string;
  wsEndpoint: string;
}

export type DesktopContentPlatform =
  | 'instagram'
  | 'linkedin'
  | 'twitter'
  | 'tiktok'
  | 'youtube';

export type DesktopContentType =
  | 'article'
  | 'caption'
  | 'hook'
  | 'reply'
  | 'script'
  | 'thread';

export type DesktopPublishIntent = 'draft' | 'publish' | 'review';

/* ─── Session ─── */

export interface IDesktopSession {
  issuedAt: string;
  token: string;
  userEmail?: string;
  userId: string;
  userName?: string;
}

/* ─── Workspace ─── */

export interface IDesktopWorkspaceFile {
  extension: string;
  name: string;
  path: string;
  relativePath: string;
  size: number;
  updatedAt: string;
}

export interface IDesktopWorkspace {
  createdAt: string;
  fileIndex: IDesktopWorkspaceFile[];
  id: string;
  indexingState: 'idle' | 'indexing';
  lastOpenedAt: string;
  linkedProjectId?: string;
  localDraftCount: number;
  name: string;
  path: string;
  pendingSyncCount: number;
  updatedAt: string;
}

/* ─── Sync ─── */

export interface IDesktopSyncJob {
  createdAt: string;
  error?: string;
  id: string;
  payload: string;
  retryCount: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  type: string;
  updatedAt: string;
  workspaceId?: string;
}

export interface IDesktopSyncState {
  failedCount: number;
  lastSyncAt?: string;
  pendingCount: number;
  retryingCount: number;
  runningCount: number;
}

/* ─── Recents ─── */

export interface IDesktopRecentItem {
  id: string;
  kind: 'project' | 'workspace';
  label: string;
  openedAt: string;
  value: string;
}

/* ─── Cloud ─── */

export interface IDesktopCloudProject {
  id: string;
  name: string;
  status?: string;
}

/* ─── Preferences ─── */

export interface IDesktopPreferences {
  nativeNotificationsEnabled: boolean;
}

/* ─── Bootstrap ─── */

export interface IDesktopBootstrap {
  environment: IDesktopEnvironment;
  preferences: IDesktopPreferences;
  recents: IDesktopRecentItem[];
  session: IDesktopSession | null;
  syncState: IDesktopSyncState;
  workspaces: IDesktopWorkspace[];
}

/* ─── Generated Content ─── */

export interface IDesktopGeneratedContent {
  content: string;
  hooks?: string[];
  id: string;
  platform: DesktopContentPlatform | string;
  type: DesktopContentType | string;
}

export interface IDesktopGenerationOptions {
  platform: DesktopContentPlatform;
  projectId?: string;
  prompt: string;
  publishIntent: DesktopPublishIntent;
  sourceDraftId?: string;
  sourceTrendId?: string;
  sourceTrendTopic?: string;
  type: DesktopContentType;
}

export interface IDesktopPublishResult {
  platform: DesktopContentPlatform | string;
  postId: string;
  publishedAt: string;
  status: 'draft' | 'published';
}

export interface IDesktopContentRunDraft {
  content?: string;
  createdAt: string;
  generatedContent?: IDesktopGeneratedContent;
  id: string;
  platform: DesktopContentPlatform;
  projectId?: string;
  prompt: string;
  publishIntent: DesktopPublishIntent;
  publishResult?: IDesktopPublishResult;
  sourceType: 'prompt' | 'trend';
  sourceTrendId?: string;
  sourceTrendTopic?: string;
  status: 'draft' | 'generated' | 'published';
  title: string;
  type: DesktopContentType;
  updatedAt: string;
  workspaceId: string;
}

/* ─── Trends ─── */

export interface IDesktopTrend {
  engagementScore: number;
  id: string;
  platform: DesktopContentPlatform | string;
  summary?: string;
  topic: string;
  viralityScore: number;
}

/* ─── Ingredients ─── */

export interface IDesktopIngredient {
  content: string;
  id: string;
  platform?: string;
  title: string;
  totalVotes: number;
}

/* ─── Analytics ─── */

export interface IDesktopAnalytics {
  recentPosts: Array<{
    content: string;
    id: string;
    platform: DesktopContentPlatform | string;
    views: number;
  }>;
  topPlatform: string;
  totalEngagements: number;
  totalPosts: number;
  totalViews: number;
}

/* ─── Threads & Messages ─── */

export interface IDesktopMessage {
  content: string;
  createdAt: string;
  draftId?: string;
  generatedContent?: IDesktopGeneratedContent;
  id: string;
  role: 'assistant' | 'user';
}

export interface IDesktopThread {
  createdAt: string;
  id: string;
  messages: IDesktopMessage[];
  projectId?: string;
  status?: 'awaiting-response' | 'idle';
  title: string;
  updatedAt: string;
  workspaceId?: string;
}

/* ─── Agents ─── */

export interface IDesktopAgentRun {
  completedAt?: string;
  id: string;
  startedAt: string;
  status: 'completed' | 'failed' | 'pending' | 'running';
}

export interface IDesktopAgent {
  avatar?: string;
  id: string;
  isActive: boolean;
  lastRunAt?: string;
  latestRun?: IDesktopAgentRun;
  name: string;
  platforms: string[];
  recentRuns: IDesktopAgentRun[];
  status: 'active' | 'paused';
}

export interface IDesktopAgentRunResult {
  runId: string;
  status: 'pending' | 'running';
}

/* ─── Workflows ─── */

export interface IDesktopWorkflow {
  description?: string;
  id: string;
  lastExecutedAt?: string;
  lifecycle: 'archived' | 'draft' | 'published';
  latestRun?: {
    completedAt?: string;
    id: string;
    mode: 'batch' | 'single';
    startedAt: string;
    status: 'completed' | 'failed' | 'pending' | 'running';
  };
  name: string;
  nodeCount: number;
  supportsBatch: boolean;
}

export interface IDesktopWorkflowRunResult {
  runId: string;
  status: 'pending' | 'running';
}

/* ─── Bridge (renderer ↔ main) ─── */

export interface IGenfeedDesktopBridge {
  app: {
    getDiagnostics: () => Promise<{
      isPackaged: boolean;
      platform: string;
      releaseChannel: 'development' | 'production';
      version: string;
    }>;
    getBootstrap: () => Promise<IDesktopBootstrap>;
    onDidBootstrapChange: (
      callback: (bootstrap: IDesktopBootstrap) => void,
    ) => () => void;
    onToggleSidebar: (callback: () => void) => () => void;
  };
  auth: {
    getSession: () => Promise<IDesktopSession | null>;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    onDidChangeSession: (
      callback: (session: IDesktopSession | null) => void,
    ) => () => void;
  };
  cache: {
    getPath: () => Promise<string>;
    writeAsset: (filename: string, data: ArrayBuffer) => Promise<string>;
  };
  cloud: {
    generateContent: (
      params: IDesktopGenerationOptions,
    ) => Promise<IDesktopGeneratedContent>;
    generateHooks: (topic: string) => Promise<string[]>;
    getAnalytics: (params: { days: number }) => Promise<IDesktopAnalytics>;
    getIngredients: (filter?: {
      limit?: number;
      platform?: string;
    }) => Promise<IDesktopIngredient[]>;
    getTrends: (platform: string) => Promise<IDesktopTrend[]>;
    listAgents: () => Promise<IDesktopAgent[]>;
    listProjects: () => Promise<IDesktopCloudProject[]>;
    listWorkflows: () => Promise<IDesktopWorkflow[]>;
    publishPost: (params: {
      content: string;
      draftId?: string;
      platform: DesktopContentPlatform | string;
    }) => Promise<IDesktopPublishResult>;
    runAgent: (agentId: string) => Promise<IDesktopAgentRunResult>;
    runWorkflow: (params: {
      batch?: boolean;
      workflowId: string;
    }) => Promise<IDesktopWorkflowRunResult>;
  };
  drafts: {
    delete: (workspaceId: string, draftId: string) => Promise<void>;
    get: (
      workspaceId: string,
      draftId: string,
    ) => Promise<IDesktopContentRunDraft | null>;
    list: (workspaceId: string) => Promise<IDesktopContentRunDraft[]>;
    save: (
      workspaceId: string,
      draft: IDesktopContentRunDraft,
    ) => Promise<IDesktopContentRunDraft>;
  };
  files: {
    importAssets: (
      workspaceId: string,
      filePaths?: string[],
    ) => Promise<string[]>;
    openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
    readFile: (workspaceId: string, relativePath: string) => Promise<string>;
    writeFile: (
      workspaceId: string,
      relativePath: string,
      contents: string,
    ) => Promise<void>;
  };
  notifications: {
    notify: (title: string, body: string) => Promise<void>;
  };
  platform: string;
  sync: {
    getJobs: (workspaceId?: string) => Promise<IDesktopSyncJob[]>;
    getState: () => Promise<IDesktopSyncState>;
    queueJob: (
      type: string,
      payload: string,
      workspaceId?: string,
    ) => Promise<IDesktopSyncJob>;
  };
  workspace: {
    getRecentWorkspaces: () => Promise<IDesktopWorkspace[]>;
    linkProject: (
      workspaceId: string,
      projectId: string,
    ) => Promise<IDesktopWorkspace>;
    openWorkspace: () => Promise<IDesktopWorkspace | null>;
    readWorkspace: (workspaceId: string) => Promise<IDesktopWorkspace>;
    revealInFinder: (workspaceId: string) => Promise<void>;
  };
  onQuickGenerate: (callback: () => void) => () => void;
}
