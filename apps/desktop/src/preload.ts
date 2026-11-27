import type { IGenfeedDesktopBridge } from '@genfeedai/contracts/desktop';
import { DESKTOP_IPC_CHANNELS } from '@genfeedai/contracts/desktop';
import { contextBridge, ipcRenderer } from 'electron';
import { isTrustedDesktopAppOrigin } from './main/app-shell-origin.util';

const TRAILING_SLASH_PATTERN = /\/$/;

const APP_ORIGIN_ARGUMENT = '--genfeed-app-origin=';
const WS_ENDPOINT_ARGUMENT = '--genfeed-ws-endpoint=';

const getDesktopAppOrigin = (): string | null => {
  const argument = process.argv.find((value) =>
    value.startsWith(APP_ORIGIN_ARGUMENT),
  );

  if (!argument) {
    return null;
  }

  try {
    const url = new URL(argument.slice(APP_ORIGIN_ARGUMENT.length));

    if (!isTrustedDesktopAppOrigin(url.toString())) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
};

/** Notifications endpoint of the server Desktop was launched against. */
const getDesktopWsEndpoint = (): string | null => {
  const argument = process.argv.find((value) =>
    value.startsWith(WS_ENDPOINT_ARGUMENT),
  );

  if (!argument) {
    return null;
  }

  try {
    const url = new URL(argument.slice(WS_ENDPOINT_ARGUMENT.length));
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString().replace(TRAILING_SLASH_PATTERN, '')
      : null;
  } catch {
    return null;
  }
};

const desktopBridge: IGenfeedDesktopBridge = {
  agentRuntime: {
    cancelTurn: async (turnId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentRuntimeCancelTurn, turnId),
    onEvent: (callback) => {
      const listener = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.agentRuntimeEvent, listener);

      return () => {
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.agentRuntimeEvent, listener);
      };
    },
    startTurn: async (request) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.agentRuntimeStartTurn, request),
  },
  app: {
    getRuntimeContext: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appRuntimeContext),
    onDidChangeRuntimeContext: (callback) => {
      const listener = (_event: unknown, context: unknown) =>
        callback(context as Parameters<typeof callback>[0]);
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.runtimeContextChanged, listener);
      return () =>
        ipcRenderer.removeListener(
          DESKTOP_IPC_CHANNELS.runtimeContextChanged,
          listener,
        );
    },
    detectEditingTools: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appDetectEditingTools),
    detectLocalTools: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appDetectLocalTools),
    getBootstrap: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appBootstrap),
    getDiagnostics: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appGetDiagnostics),
    openExternalPath: async (pathname) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appOpenExternalPath, pathname),
    revealLogs: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.appRevealLogs),
    onDidBootstrapChange: (callback) => {
      const listener = (_event: unknown, bootstrap: unknown) => {
        callback(bootstrap as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.bootstrapChanged, listener);

      return () => {
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.bootstrapChanged, listener);
      };
    },
    getWindowChrome: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.windowChromeState),
    onDidChangeWindowChrome: (callback) => {
      const listener = (_event: unknown, state: unknown) =>
        callback(state as Parameters<typeof callback>[0]);
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.windowChromeChanged, listener);

      return () => {
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.windowChromeChanged, listener);
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
    completeWithCode: async (code) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.authCompleteWithCode, code),
    getSession: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.authGetSession),
    login: async (continuation) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.authLogin, continuation),
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
  cloud: {
    generateContent: async (params) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.cloudGenerateContent, params),
    generateHooks: async (topic, brandId) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.cloudGenerateHooks,
        topic,
        brandId,
      ),
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
  notifications: {
    notify: async (title, body) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.notify, title, body),
  },
  onQuickGenerate: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(DESKTOP_IPC_CHANNELS.quickGenerate, listener);

    return () => {
      ipcRenderer.off(DESKTOP_IPC_CHANNELS.quickGenerate, listener);
    };
  },
  platform: process.platform,
  server: {
    getState: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.serverGetState),
    select: async (selection) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.serverSelect, selection),
    validateSelfHosted: async (config) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.serverValidate, config),
  },
  terminal: {
    create: async (options) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.terminalCreate, options),
    kill: async (sessionId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.terminalKill, sessionId),
    onData: (callback) => {
      const listener = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.terminalData, listener);

      return () => {
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.terminalData, listener);
      };
    },
    onExit: (callback) => {
      const listener = (_event: unknown, payload: unknown) => {
        callback(payload as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.terminalExit, listener);

      return () => {
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.terminalExit, listener);
      };
    },
    resize: async (sessionId, cols, rows) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.terminalResize,
        sessionId,
        cols,
        rows,
      ),
    write: async (sessionId, data) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.terminalWrite, sessionId, data),
  },
  workspace: {
    chooseProjectsHome: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceChooseProjectsHome),
    createProject: async (request) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceCreateProject, request),
    getState: async () =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceGetState),
    linkContext: async (workspaceId, context) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.workspaceLinkContext,
        workspaceId,
        context,
      ),
    listDirectory: async (workspaceId, relativePath) =>
      ipcRenderer.invoke(
        DESKTOP_IPC_CHANNELS.workspaceListDirectory,
        workspaceId,
        relativePath,
      ),
    onDidChange: (callback) => {
      const listener = (_event: unknown, state: unknown) => {
        callback(state as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on(DESKTOP_IPC_CHANNELS.workspaceChanged, listener);

      return () => {
        ipcRenderer.off(DESKTOP_IPC_CHANNELS.workspaceChanged, listener);
      };
    },
    openFolder: async (context) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceOpenFolder, context),
    remove: async (workspaceId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceRemove, workspaceId),
    revealInFileManager: async (workspaceId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceReveal, workspaceId),
    setActive: async (workspaceId) =>
      ipcRenderer.invoke(DESKTOP_IPC_CHANNELS.workspaceSetActive, workspaceId),
  },
};

const appOrigin = getDesktopAppOrigin();
const wsEndpoint = getDesktopWsEndpoint();

if (appOrigin) {
  contextBridge.exposeInMainWorld('__GENFEED_DESKTOP_ENV__', {
    apiEndpoint: `${appOrigin}/v1`,
    ...(wsEndpoint ? { wsEndpoint } : {}),
  });
}

contextBridge.exposeInMainWorld('genfeedDesktop', desktopBridge);
