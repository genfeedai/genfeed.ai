import type { AgentExternalRuntimeKey } from '../constants/agent-external-runtime.constant';
import type { IAgentThreadExternalRuntime } from '../interfaces/ai/agent-external-turn.interface';

export const DESKTOP_HTTP_HEADERS = {
  minimumVersion: 'x-genfeed-desktop-minimum-version',
  token: 'x-genfeed-desktop-token',
  userEmail: 'x-genfeed-desktop-user-email',
  userId: 'x-genfeed-desktop-user-id',
  userName: 'x-genfeed-desktop-user-name',
  version: 'x-genfeed-desktop-version',
} as const;

export const DESKTOP_APP_PROTOCOL_SCHEME = 'genfeedai-desktop';
export const DESKTOP_THREAD_LINK_HOST = 'thread';

const DESKTOP_THREAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Deep link that opens an agent thread in Genfeed Desktop, e.g. so a thread
 * bound to a local CLI runtime can be continued where that CLI can run.
 */
export function buildDesktopThreadLink(threadId: string): string {
  if (!DESKTOP_THREAD_ID_PATTERN.test(threadId)) {
    throw new Error('Invalid desktop thread id.');
  }

  return `${DESKTOP_APP_PROTOCOL_SCHEME}://${DESKTOP_THREAD_LINK_HOST}/${encodeURIComponent(threadId)}`;
}

/** The thread id of a `buildDesktopThreadLink` URL, or null for anything else. */
export function parseDesktopThreadLink(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const threadId = decodeURIComponent(url.pathname.slice(1));

    if (
      url.protocol !== `${DESKTOP_APP_PROTOCOL_SCHEME}:` ||
      url.hostname !== DESKTOP_THREAD_LINK_HOST ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.port.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0 ||
      !DESKTOP_THREAD_ID_PATTERN.test(threadId)
    ) {
      return null;
    }

    return threadId;
  } catch {
    return null;
  }
}

export const DESKTOP_IPC_CHANNELS = {
  agentRuntimeCancelTurn: 'desktop:agentRuntime:cancelTurn',
  agentRuntimeEvent: 'desktop:agentRuntime:event',
  agentRuntimeStartTurn: 'desktop:agentRuntime:startTurn',
  appBootstrap: 'desktop:app:bootstrap',
  appRuntimeContext: 'desktop:app:runtimeContext',
  runtimeContextChanged: 'desktop:app:runtimeContextChanged',
  appDetectEditingTools: 'desktop:app:detectEditingTools',
  appDetectLocalTools: 'desktop:app:detectLocalTools',
  appGetDiagnostics: 'desktop:app:getDiagnostics',
  appOpenExternalPath: 'desktop:app:openExternalPath',
  appRevealLogs: 'desktop:app:revealLogs',
  authChanged: 'desktop:auth:changed',
  authCompleteWithCode: 'desktop:auth:completeWithCode',
  authGetSession: 'desktop:auth:getSession',
  authLogin: 'desktop:auth:login',
  authLogout: 'desktop:auth:logout',
  bootstrapChanged: 'desktop:bootstrap:changed',
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
  getPlatform: 'desktop:getPlatform',
  notify: 'desktop:notify',
  quickGenerate: 'desktop:quickGenerate',
  serverGetState: 'desktop:server:getState',
  serverSelect: 'desktop:server:select',
  serverValidate: 'desktop:server:validate',
  terminalCreate: 'desktop:terminal:create',
  terminalData: 'desktop:terminal:data',
  terminalExit: 'desktop:terminal:exit',
  terminalKill: 'desktop:terminal:kill',
  terminalResize: 'desktop:terminal:resize',
  terminalWrite: 'desktop:terminal:write',
  toggleSidebar: 'desktop:view:toggleSidebar',
  windowChromeChanged: 'desktop:window:chromeChanged',
  windowChromeState: 'desktop:window:chromeState',
  workspaceChanged: 'desktop:workspace:changed',
  workspaceChooseProjectsHome: 'desktop:workspace:chooseProjectsHome',
  workspaceCreateProject: 'desktop:workspace:createProject',
  workspaceGetState: 'desktop:workspace:getState',
  workspaceLinkContext: 'desktop:workspace:linkContext',
  workspaceListDirectory: 'desktop:workspace:listDirectory',
  workspaceOpenFolder: 'desktop:workspace:openFolder',
  workspaceRemove: 'desktop:workspace:remove',
  workspaceReveal: 'desktop:workspace:reveal',
  workspaceSetActive: 'desktop:workspace:setActive',
} as const;

/* Environment */

export interface IDesktopEnvironment {
  apiEndpoint: string;
  appEndpoint: string;
  appName: string;
  appPort: number;
  authEndpoint: string;
  cdnUrl: string;
  /** Genfeed MCP (Streamable HTTP) endpoint for the selected server. */
  mcpEndpoint: string;
  /** Stable id of the selected server; scopes the stored desktop session. */
  serverId: string;
  serverKind: DesktopServerKind;
  sentryDsn?: string;
  sentryEnvironment?: string;
  sentryRelease?: string;
  wsEndpoint: string;
}

/** Native window state the renderer needs to lay out its own titlebar. */
export interface IDesktopWindowChromeState {
  isFullScreen: boolean;
}

/** Nonsecret, authoritative selected-server and generation execution context. */
export interface IDesktopRuntimeContext {
  version: 1;
  runtimeId: string;
  revision: number;
  status: 'ready' | 'switching';
  selectedServerId: string;
  selectedServerKind: 'cloud' | 'self-hosted';
  selectedApiEndpoint: string;
  generationExecution: 'remote' | 'unknown';
}

/* Server selection */

export type DesktopServerKind = 'cloud' | 'self-hosted';

/** User-entered self-hosted server. Optional endpoints derive from the API. */
export interface IDesktopSelfHostedServerConfig {
  apiEndpoint: string;
  appEndpoint?: string;
  mcpEndpoint?: string;
  wsEndpoint?: string;
}

/** Fully resolved endpoints for one Genfeed server. */
export interface IDesktopServerProfile {
  apiEndpoint: string;
  /** HTTPS app origin loaded as the remote shell, or null to use the bundled shell. */
  appEndpoint: string | null;
  authEndpoint: string;
  id: string;
  kind: DesktopServerKind;
  label: string;
  mcpEndpoint: string;
  wsEndpoint: string;
}

export interface IDesktopServerState {
  active: IDesktopServerProfile;
  cloud: IDesktopServerProfile;
  /** Profile used when no server was picked in-app (env override or Cloud). */
  defaultProfile: IDesktopServerProfile;
  /** True when the in-app selection is unset and the default applies. */
  isUsingDefault: boolean;
  selfHosted: IDesktopSelfHostedServerConfig | null;
  /** Server ids that currently hold a stored desktop session. */
  signedInServerIds: string[];
}

export interface IDesktopServerSelection {
  kind: DesktopServerKind;
  selfHosted?: IDesktopSelfHostedServerConfig;
}

export interface IDesktopServerValidationResult {
  error?: string;
  isValid: boolean;
  profile?: IDesktopServerProfile;
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

export interface IDesktopContentRunBrief {
  angle?: string;
  audience?: string;
  callToAction?: string;
  channelFit?: string;
  confidence?: number;
  evidence?: string[];
  hypothesis?: string;
  risk?: string;
  sourceId?: string;
  sourceUrl?: string;
}

/* Session */

export interface IDesktopSession {
  issuedAt: string;
  token: string;
  userEmail?: string;
  userId: string;
  userName?: string;
}

/* Cloud */

export interface IDesktopCloudProject {
  id: string;
  name: string;
  status?: string;
}

export type IDesktopDataResult<T> = {
  data: T;
  status: 'success';
};

export interface IDesktopDataService {
  generateContent: (
    params: IDesktopGenerationOptions,
  ) => Promise<IDesktopDataResult<IDesktopGeneratedContent>>;
  generateHooks: (
    topic: string,
    brandId?: string,
  ) => Promise<IDesktopDataResult<string[]>>;
  getAnalytics: (params: {
    days: number;
  }) => Promise<IDesktopDataResult<IDesktopAnalytics>>;
  getIngredients: (filter?: {
    limit?: number;
    platform?: string;
  }) => Promise<IDesktopDataResult<IDesktopIngredient[]>>;
  getTrends: (platform: string) => Promise<IDesktopDataResult<IDesktopTrend[]>>;
  listAgents: () => Promise<IDesktopDataResult<IDesktopAgent[]>>;
  listProjects: () => Promise<IDesktopDataResult<IDesktopCloudProject[]>>;
  listWorkflows: () => Promise<IDesktopDataResult<IDesktopWorkflow[]>>;
  publishPost: (params: {
    content: string;
    draftId?: string;
    platform: DesktopContentPlatform | string;
  }) => Promise<IDesktopDataResult<IDesktopPublishResult>>;
  runAgent: (
    agentId: string,
  ) => Promise<IDesktopDataResult<IDesktopAgentRunResult>>;
  runWorkflow: (params: {
    batch?: boolean;
    workflowId: string;
  }) => Promise<IDesktopDataResult<IDesktopWorkflowRunResult>>;
}

/* Preferences */

export interface IDesktopPreferences {
  nativeNotificationsEnabled: boolean;
}

/* Bootstrap */

export interface IDesktopBootstrap {
  environment: IDesktopEnvironment;
  preferences: IDesktopPreferences;
}

/* Generated Content */

export interface IDesktopGeneratedContent {
  content: string;
  hooks?: string[];
  id: string;
  platform: DesktopContentPlatform | string;
  type: DesktopContentType | string;
}

export interface IDesktopGenerationOptions {
  /** Generation always runs in an explicit brand context (#5219). */
  brandId?: string;
  brief?: IDesktopContentRunBrief;
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

/* Trends */

export interface IDesktopTrend {
  engagementScore: number;
  id: string;
  platform: DesktopContentPlatform | string;
  summary?: string;
  topic: string;
  viralityScore: number;
}

/* Ingredients */

export interface IDesktopIngredient {
  content: string;
  id: string;
  platform?: string;
  title: string;
  totalVotes: number;
}

/* Analytics */

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

/* Terminal */

export type DesktopTerminalKind = 'claude' | 'codex' | 'genfeed' | 'shell';

export interface IDesktopTerminalCreateOptions {
  cols?: number;
  /** Absolute directory to start in; ignored when it does not exist. */
  cwd?: string;
  kind?: DesktopTerminalKind;
  /** Opening prompt of a `claude` session, passed as its one argument; ignored for other kinds. */
  prompt?: string;
  rows?: number;
}

export interface IDesktopTerminalSession {
  command: string;
  createdAt: string;
  cwd: string;
  id: string;
  kind: DesktopTerminalKind;
  pid: number;
}

export interface IDesktopTerminalDataEvent {
  data: string;
  sessionId: string;
}

export interface IDesktopTerminalExitEvent {
  exitCode?: number;
  sessionId: string;
  signal?: number;
}

/* CLI agent runtime (user's own Claude Code / Codex subscription) */

export interface IDesktopCliAgentTurnRequest {
  brandId?: string | null;
  /**
   * A model of the user's own CLI (the thread's `requestedModel`). Omitted or
   * empty, the CLI picks its own model.
   */
  model?: string | null;
  prompt: string;
  runtimeKey: AgentExternalRuntimeKey;
  /** Existing Genfeed thread; omitted to create one for this runtime. */
  threadId?: string | null;
  /** Renderer-generated id used to correlate streamed events. */
  turnId: string;
}

export interface IDesktopCliAgentTurnHandle {
  threadId: string;
  turnId: string;
}

export type DesktopCliAgentToolCallStatus = 'completed' | 'failed' | 'running';

export interface IDesktopCliAgentToolCall {
  argsSummary: string;
  error?: string;
  id: string;
  /** Tool name without the MCP server prefix. */
  name: string;
  resultSummary?: string;
  status: DesktopCliAgentToolCallStatus;
}

export interface IDesktopCliAgentUsage {
  cachedInputTokens?: number;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type DesktopCliAgentErrorCode =
  | 'binary-not-found'
  | 'cancelled'
  | 'invalid-request'
  | 'model-unavailable'
  | 'not-authenticated'
  | 'not-signed-in'
  | 'process-failed'
  | 'timeout';

export interface IDesktopCliAgentSessionEvent {
  model?: string;
  sessionId: string;
  type: 'session';
}

export interface IDesktopCliAgentTextDeltaEvent {
  text: string;
  type: 'text-delta';
}

export interface IDesktopCliAgentMessageEvent {
  text: string;
  type: 'message';
}

export interface IDesktopCliAgentToolCallEvent {
  toolCall: IDesktopCliAgentToolCall;
  type: 'tool-call-finished' | 'tool-call-started';
}

export interface IDesktopCliAgentUsageEvent {
  type: 'usage';
  usage: IDesktopCliAgentUsage;
}

export interface IDesktopCliAgentCompletedEvent {
  /** False when the turn ran but could not be saved to the Genfeed thread. */
  isPersisted: boolean;
  persistError?: string;
  sessionId: string | null;
  text: string;
  toolCalls: IDesktopCliAgentToolCall[];
  type: 'completed';
  usage?: IDesktopCliAgentUsage;
}

export interface IDesktopCliAgentErrorEvent {
  code: DesktopCliAgentErrorCode;
  message: string;
  type: 'error';
}

export type DesktopCliAgentEvent =
  | IDesktopCliAgentCompletedEvent
  | IDesktopCliAgentErrorEvent
  | IDesktopCliAgentMessageEvent
  | IDesktopCliAgentSessionEvent
  | IDesktopCliAgentTextDeltaEvent
  | IDesktopCliAgentToolCallEvent
  | IDesktopCliAgentUsageEvent;

/** Agent thread fields Desktop main reads through the cloud API client. */
export interface IDesktopCloudAgentThread {
  brandId: string | null;
  externalRuntime: IAgentThreadExternalRuntime | null;
  id: string;
  organizationId: string | null;
  runtimeKey: string | null;
}

export interface IDesktopCliAgentTurnEvent {
  event: DesktopCliAgentEvent;
  threadId: string;
  turnId: string;
}

/* Agents */

export type DesktopAgentRunStatus =
  | 'completed'
  | 'failed'
  | 'pending'
  | 'queued'
  | 'running';

export interface IDesktopAgentRun {
  completedAt?: string;
  contentGenerated?: number;
  creditsUsed?: number;
  id: string;
  message?: string;
  outputSummary?: string;
  startedAt: string;
  status: DesktopAgentRunStatus;
  threadId?: string;
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
  message?: string;
  runId: string;
  status: DesktopAgentRunStatus;
}

/* Workflows */

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

/* Workspace folders */

/** The organization and brand whose Library a workspace folder belongs to. */
export interface IDesktopWorkspaceContext {
  brandId: string | null;
  organizationId: string | null;
}

/**
 * A folder on this machine that Desktop works in. It belongs to one server
 * (Genfeed Cloud or one self-hosted API), so a folder opened against one
 * server is not offered against another.
 */
export interface IDesktopWorkspace extends IDesktopWorkspaceContext {
  createdAt: string;
  id: string;
  lastOpenedAt: string;
  name: string;
  /** Absolute path of the folder. */
  path: string;
  serverId: string;
}

export interface IDesktopWorkspaceState {
  /** Null when no workspace is active, or its folder no longer exists. */
  activeWorkspaceId: string | null;
  /** Where "new project" creates folders. One folder per project. */
  projectsHome: string;
  /** Workspaces of the selected server, most recently opened first. */
  workspaces: IDesktopWorkspace[];
}

export interface IDesktopWorkspaceEntry {
  isDirectory: boolean;
  name: string;
  /** Path relative to the workspace root, with `/` separators. */
  path: string;
  size: number;
}

export interface IDesktopWorkspaceCreateProjectRequest
  extends IDesktopWorkspaceContext {
  name: string;
}

/* Bridge (renderer ↔ main) */

/** An installed CLI that is too old to run Genfeed agent turns. */
export interface IDesktopLocalToolUpgrade {
  key: string;
  message: string;
}

export interface IDesktopLocalToolReadiness {
  anyDetected: boolean;
  claude: boolean;
  codex: boolean;
  detected: string[];
  grok: boolean;
  /**
   * Installed CLIs reported as not ready until they are updated. Optional
   * because older Desktop builds do not send it.
   */
  upgradesRequired?: IDesktopLocalToolUpgrade[];
}

/** Programs a local edit or render calls, which Desktop does not ship. */
export type DesktopEditingToolKey =
  | 'browser'
  | 'bun'
  | 'ffmpeg'
  | 'ffprobe'
  | 'genfeed-cli'
  | 'python'
  | 'speech-to-text'
  | 'yt-dlp';

export type DesktopEditingToolStatus = 'found' | 'missing' | 'too-old';

export interface IDesktopEditingTool {
  /** The one command that installs it. Desktop never runs it itself. */
  installCommand: string;
  key: DesktopEditingToolKey;
  label: string;
  /** Oldest version the Genfeed skills need; null when any version works. */
  minimumVersion: string | null;
  /** Where it was found; null when it is missing. */
  path: string | null;
  status: DesktopEditingToolStatus;
  /** Null when it is missing, or its build reports no version number. */
  version: string | null;
}

export interface IDesktopEditingToolsReadiness {
  tools: IDesktopEditingTool[];
}

export interface IGenfeedDesktopBridge {
  agentRuntime: {
    cancelTurn: (turnId: string) => Promise<void>;
    onEvent: (
      callback: (event: IDesktopCliAgentTurnEvent) => void,
    ) => () => void;
    startTurn: (
      request: IDesktopCliAgentTurnRequest,
    ) => Promise<IDesktopCliAgentTurnHandle>;
  };
  app: {
    getRuntimeContext: () => Promise<IDesktopRuntimeContext>;
    onDidChangeRuntimeContext: (
      callback: (context: IDesktopRuntimeContext) => void,
    ) => () => void;
    detectEditingTools: () => Promise<IDesktopEditingToolsReadiness>;
    detectLocalTools: () => Promise<IDesktopLocalToolReadiness>;
    getDiagnostics: () => Promise<{
      isPackaged: boolean;
      logPath: string;
      platform: string;
      releaseChannel: 'development' | 'production';
      version: string;
    }>;
    getBootstrap: () => Promise<IDesktopBootstrap>;
    onDidBootstrapChange: (
      callback: (bootstrap: IDesktopBootstrap) => void,
    ) => () => void;
    onToggleSidebar: (callback: () => void) => () => void;
    getWindowChrome: () => Promise<IDesktopWindowChromeState>;
    onDidChangeWindowChrome: (
      callback: (state: IDesktopWindowChromeState) => void,
    ) => () => void;
    openExternalPath: (pathname: string) => Promise<void>;
    revealLogs: () => Promise<void>;
  };
  auth: {
    completeWithCode: (code: string) => Promise<void>;
    getSession: () => Promise<IDesktopSession | null>;
    /**
     * Open sign-in in the system browser. `continuation` is the product path
     * the shell returns to after the browser callback (an OAuth consent
     * request); main validates it and falls back to the app root.
     */
    login: (continuation?: string) => Promise<void>;
    logout: () => Promise<void>;
    onDidChangeSession: (
      callback: (session: IDesktopSession | null) => void,
    ) => () => void;
  };
  cloud: {
    generateContent: (
      params: IDesktopGenerationOptions,
    ) => Promise<IDesktopGeneratedContent>;
    generateHooks: (topic: string, brandId?: string) => Promise<string[]>;
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
  notifications: {
    notify: (title: string, body: string) => Promise<void>;
  };
  platform: string;
  server: {
    getState: () => Promise<IDesktopServerState>;
    /** Persists the selection and restarts Genfeed Desktop on that server. */
    select: (selection: IDesktopServerSelection) => Promise<void>;
    validateSelfHosted: (
      config: IDesktopSelfHostedServerConfig,
    ) => Promise<IDesktopServerValidationResult>;
  };
  terminal: {
    create: (
      options?: IDesktopTerminalCreateOptions,
    ) => Promise<IDesktopTerminalSession>;
    kill: (sessionId: string) => Promise<void>;
    onData: (
      callback: (event: IDesktopTerminalDataEvent) => void,
    ) => () => void;
    onExit: (
      callback: (event: IDesktopTerminalExitEvent) => void,
    ) => () => void;
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
    write: (sessionId: string, data: string) => Promise<void>;
  };
  onQuickGenerate: (callback: () => void) => () => void;
  workspace: {
    /** Moves where new projects are created; existing folders stay put. */
    chooseProjectsHome: () => Promise<IDesktopWorkspaceState>;
    createProject: (
      request: IDesktopWorkspaceCreateProjectRequest,
    ) => Promise<IDesktopWorkspace>;
    getState: () => Promise<IDesktopWorkspaceState>;
    linkContext: (
      workspaceId: string,
      context: IDesktopWorkspaceContext,
    ) => Promise<IDesktopWorkspace>;
    /** Direct children of a folder inside the workspace; refuses paths outside it. */
    listDirectory: (
      workspaceId: string,
      relativePath?: string,
    ) => Promise<IDesktopWorkspaceEntry[]>;
    /** Native folder picker; resolves null when the user cancels. */
    openFolder: (
      context: IDesktopWorkspaceContext,
    ) => Promise<IDesktopWorkspace | null>;
    onDidChange: (
      callback: (state: IDesktopWorkspaceState) => void,
    ) => () => void;
    /** Forgets the workspace. The folder and its files stay on disk. */
    remove: (workspaceId: string) => Promise<void>;
    revealInFileManager: (workspaceId: string) => Promise<void>;
    setActive: (workspaceId: string | null) => Promise<IDesktopWorkspaceState>;
  };
}
