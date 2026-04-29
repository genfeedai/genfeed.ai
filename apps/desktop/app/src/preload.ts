import type { IGenfeedDesktopBridge } from '@genfeedai/desktop-contracts';
import { DESKTOP_IPC_CHANNELS } from '@genfeedai/desktop-contracts';
import { contextBridge, ipcRenderer } from 'electron';

const desktopBridge: IGenfeedDesktopBridge = {
  app: {
    getBootstrap: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appBootstrap),
    getDiagnostics: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appGetDiagnostics),
    onDidBootstrapChange: (callback) => {
      const listener = (_event: unknown, bootstrap: unknown) => {
        callback(bootstrap as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.bootstrapChanged, listener);

      return () => {
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.bootstrapChanged, listener);
      };
    },
    onToggleSidebar: (callback) => {
      const listener = () => callback();
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.toggleSidebar, listener);

      return () => {
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.toggleSidebar, listener);
      };
    },
  },
  auth: {
    getSession: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.authGetSession),
    login: async () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.authLogin),
    logout: async () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.authLogout),
    onDidChangeSession: (callback) => {
      const listener = (_event: unknown, session: unknown) => {
        callback(session as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.authChanged, listener);

      return () => {
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.authChanged, listener);
      };
    },
  },
  cache: {
    getPath: async () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cacheGetPath),
    writeAsset: async (filename, data) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cacheWriteAsset, filename, data),
  },
  cloud: {
    generateContent: async (params) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudGenerateContent, params),
    generateHooks: async (topic) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudGenerateHooks, topic),
    getAnalytics: async (params) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudGetAnalytics, params),
    getIngredients: async (filter) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudGetIngredients, filter),
    getTrends: async (platform) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudGetTrends, platform),
    listAgents: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudListAgents),
    listProjects: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudListProjects),
    listWorkflows: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudListWorkflows),
    publishPost: async (params) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudPublishPost, params),
    runAgent: async (agentId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudRunAgent, agentId),
    runWorkflow: async (params) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudRunWorkflow, params),
  },
  drafts: {
    delete: async (workspaceId, draftId) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.draftsDelete,
        workspaceId,
        draftId,
      ),
    get: async (workspaceId, draftId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.draftsGet, workspaceId, draftId),
    list: async (workspaceId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.draftsList, workspaceId),
    save: async (workspaceId, draft) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.draftsSave, workspaceId, draft),
  },
  files: {
    importAssets: async (workspaceId, filePaths) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.filesImportAssets,
        workspaceId,
        filePaths,
      ),
    openFileDialog: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.openFileDialog),
    readFile: async (workspaceId, relativePath) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.filesRead,
        workspaceId,
        relativePath,
      ),
    writeFile: async (workspaceId, relativePath, contents) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.filesWrite,
        workspaceId,
        relativePath,
        contents,
      ),
  },
  generation: {
    clearProviderConfig: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.generationClearProviderConfig),
    getProviderConfig: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.generationGetProviderConfig),
    saveProviderConfig: async (config) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.generationSaveProviderConfig,
        config,
      ),
    testProviderConfig: async (config) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.generationTestProviderConfig,
        config,
      ),
  },
  notifications: {
    notify: async (title, body) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.notify, title, body),
  },
  onboarding: {
    getState: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appGetOnboardingState),
    setCompleted: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appSetOnboardingCompleted),
  },
  onQuickGenerate: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.quickGenerate, listener);

    return () => {
      ipcRenderer.off(DESKTOP_IPC_CHANNELS.quickGenerate, listener);
    };
  },
  platform: process.platform,
  sync: {
    getCursor: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.syncGetCursor),
    getJobs: async (workspaceId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.syncGetJobs, workspaceId),
    getState: async () => ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.syncGetState),
    onSyncThreadsRequested: (callback) => {
      const listener = () => callback();
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.syncThreadsRequested, listener);
      return () =>
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.syncThreadsRequested, listener);
    },
    queueJob: async (type, payload, workspaceId) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.syncQueueJob,
        type,
        payload,
        workspaceId,
      ),
    setCursor: async (cursor: string) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.syncSetCursor, cursor),
    triggerThreads: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.syncTriggerThreads),
  },
  workspace: {
    getRecentWorkspaces: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceRecent),
    linkProject: async (workspaceId, projectId) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.workspaceLinkProject,
        workspaceId,
        projectId,
      ),
    openWorkspace: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceOpen),
    readWorkspace: async (workspaceId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceRead, workspaceId),
    revealInFinder: async (workspaceId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceReveal, workspaceId),
  },
};

contextBridge.exposeInMainWorld('genfeedDesktop', desktopBridge);
