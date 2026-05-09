import fs from 'node:fs';
import path from 'node:path';
import type {
  IDesktopBootstrap,
  IDesktopContentRunDraft,
  IDesktopDataService,
  IDesktopGenerationOptions,
  IDesktopGenerationProviderConfig,
  IDesktopTerminalCreateOptions,
  IDesktopWorkflowGenerationOptions,
} from '@genfeedai/desktop-contracts';
import { DESKTOP_IPC_CHANNELS } from '@genfeedai/desktop-contracts';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  shell,
} from 'electron';
import { DesktopAppShellService } from './main/app-shell.service';
import {
  buildDesktopFailureScreenUrl,
  buildDesktopLoadingScreenUrl,
  getDesktopBootBackground,
} from './main/boot-screen';
import { DesktopCloudService } from './main/cloud.service';
import { DesktopConfigService } from './main/config.service';
import { DesktopDraftsService } from './main/drafts.service';
import { buildExternalAppUrl } from './main/external-url.util';
import { DesktopFilesService } from './main/files.service';
import { DesktopGenerationService } from './main/generation.service';
import { DesktopKvService } from './main/kv.service';
import { DesktopLocalService } from './main/local.service';
import { buildDesktopMenu } from './main/menu.service';
import { DesktopPgliteService } from './main/pglite.service';
import { DesktopPrismaService } from './main/prisma.service';
import { DesktopSessionService } from './main/session.service';
import { DesktopShortcutsService } from './main/shortcuts.service';
import { DesktopSqliteMigratorService } from './main/sqlite-migrator.service';
import { DesktopSyncService } from './main/sync.service';
import { DesktopTelemetryService } from './main/telemetry.service';
import { DesktopTerminalService } from './main/terminal.service';
import { DesktopTrayService } from './main/tray.service';
import { DesktopWorkspaceService } from './main/workspace.service';

const configService = new DesktopConfigService();
const environment = configService.getEnvironment();

let mainWindow: BrowserWindow | null = null;
let bootstrapCache: IDesktopBootstrap | null = null;
let pgliteService: DesktopPgliteService;
let prismaService: DesktopPrismaService;
let kvService: DesktopKvService;
let sessionService: DesktopSessionService;
let workspaceService: DesktopWorkspaceService;
let filesService: DesktopFilesService;
let syncService: DesktopSyncService;
let terminalService: DesktopTerminalService;
let generationService: DesktopGenerationService;
let cloudService: DesktopCloudService;
let localService: DesktopLocalService;
let draftsService: DesktopDraftsService;
let appShellService: DesktopAppShellService;
let isOfflineMode = false;

const telemetryService = new DesktopTelemetryService(environment);

const trayService = new DesktopTrayService();
const shortcutsService = new DesktopShortcutsService();

let isQuitting = false;
const isSmokeTest =
  process.argv.includes('--smoke-test') ||
  process.env.GENFEED_DESKTOP_SMOKE_TEST === '1';

const LOCAL_PROVIDER_REQUIRED_ERROR =
  'Configure a local generation provider before generating content.';

const CLOUD_CREDITS_OR_LOCAL_PROVIDER_ERROR =
  'Connect your Genfeed account to use Genfeed server credits, or configure a local provider/API key for offline generation.';

const isLocalProviderRequiredError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes(LOCAL_PROVIDER_REQUIRED_ERROR);

const LOCAL_ORGANIZATION = {
  id: 'local-org',
  name: 'Local Workspace',
  slug: 'local-workspace',
} as const;
const LOCAL_USER = {
  id: 'local-user',
  name: 'Local Desktop User',
  organizationId: LOCAL_ORGANIZATION.id,
} as const;
const OFFLINE_MODE_KEY = 'desktop.offline.mode';
const ONBOARDING_COMPLETED_KEY = 'onboarding.completed';
const SYNC_THREADS_CURSOR_KEY = 'sync.threads.cursor';
const LOCAL_CLERK_ID_KEY = 'local.user.clerkId';

function getClerkId(): string | null {
  return kvService.getValueSync(LOCAL_CLERK_ID_KEY);
}

function getDataService(): IDesktopDataService {
  return sessionService.getSession() ? cloudService : localService;
}

const emitQuickGenerate = (): void => {
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.quickGenerate);
};

const emitSession = async (): Promise<void> => {
  const session = sessionService.getSession();
  telemetryService.setUser(session);
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.authChanged, session);
};

const emitBootstrap = async (): Promise<void> => {
  bootstrapCache = null;
  mainWindow?.webContents.send(
    DESKTOP_IPC_CHANNELS.bootstrapChanged,
    getBootstrap(),
  );
};

const getBootstrap = (): IDesktopBootstrap => {
  if (bootstrapCache) {
    return bootstrapCache;
  }

  const bootstrap: IDesktopBootstrap = {
    clerkId: getClerkId(),
    environment: sessionService.getEnvironment(),
    isOfflineMode,
    localOrganization: { ...LOCAL_ORGANIZATION },
    localUser: {
      ...LOCAL_USER,
      userEmail: sessionService.getSession()?.userEmail,
    },
    localUserId: LOCAL_USER.id,
    preferences: {
      nativeNotificationsEnabled: Notification.isSupported(),
    },
    recents: workspaceService.listRecents(),
    session: sessionService.getSession(),
    syncState: syncService.getState(),
    workspaces: workspaceService.listRecentWorkspaces(),
  };

  bootstrapCache = bootstrap;
  return bootstrap;
};

const runDataService = async <T>(
  callback: (service: IDesktopDataService) => Promise<T>,
): Promise<T> => {
  try {
    return await callback(getDataService());
  } catch (error) {
    if (isLocalProviderRequiredError(error)) {
      throw new Error(CLOUD_CREDITS_OR_LOCAL_PROVIDER_ERROR);
    }

    throw error;
  }
};

const acquiredSingleInstanceLock = app.requestSingleInstanceLock();

if (!acquiredSingleInstanceLock) {
  app.quit();
}

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    backgroundColor: getDesktopBootBackground(),
    height: 980,
    minHeight: 780,
    minWidth: 1280,
    show: false,
    title: 'GenFeed',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
    },
    width: 1560,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const isDev = !app.isPackaged;

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') {
      return;
    }

    const key = input.key?.toLowerCase();
    const isMacToggle =
      process.platform === 'darwin' && input.meta && input.alt && key === 'i';
    const isWinToggle =
      process.platform !== 'darwin' &&
      input.control &&
      input.shift &&
      key === 'i';

    if (isMacToggle || isWinToggle) {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', () => {
    telemetryService.captureException(new Error('Renderer failed to load'), {
      surface: 'renderer',
    });
    if (isSmokeTest) {
      app.exit(1);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    telemetryService.captureException(
      new Error(`Renderer process exited: ${details.reason}`),
      {
        exitCode: details.exitCode,
        reason: details.reason,
      },
    );
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  appShellService.registerAuthHeaders(mainWindow);

  try {
    await mainWindow.loadURL(buildDesktopLoadingScreenUrl());
    await appShellService.start();
    await mainWindow.loadURL(
      appShellService.buildInitialUrl(sessionService.getSession()),
    );

    if (isDev && !isSmokeTest) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    if (isSmokeTest) {
      setTimeout(() => app.exit(0), 250);
    }
  } catch (error) {
    process.stderr.write(
      `[desktop] app shell boot failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );

    telemetryService.captureException(error, {
      surface: 'app-shell',
    });

    if (isSmokeTest) {
      app.exit(1);
      return;
    }

    await mainWindow.loadURL(buildDesktopFailureScreenUrl());
  }

  buildDesktopMenu(mainWindow, () => {
    void workspaceService.openWorkspace().then(async (workspace) => {
      if (!workspace) {
        return;
      }

      await emitBootstrap();
      mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.toggleSidebar);
    });
  });
};

const handleAuthCallback = async (rawUrl: string): Promise<void> => {
  const session = await sessionService.handleCallback(rawUrl);

  if (!session) {
    telemetryService.captureException(
      new Error('Desktop auth callback failed'),
      {
        surface: 'auth-callback',
      },
    );
    await emitSession();
    await emitBootstrap();
    if (Notification.isSupported()) {
      void new Notification({
        body: 'The browser returned an invalid or expired desktop sign-in key. Start sign-in again from the desktop app.',
        title: 'Desktop authentication failed',
      }).show();
    }
    return;
  }

  await kvService.setValue(LOCAL_CLERK_ID_KEY, session.userId);
  isOfflineMode = false;
  await kvService.setValue(OFFLINE_MODE_KEY, '0');
  await emitSession();
  await emitBootstrap();
  void new Notification({
    body: session.userEmail || 'Authenticated successfully.',
    title: 'GenFeed',
  }).show();
};

const registerProtocolHandling = (): void => {
  app.setAsDefaultProtocolClient('genfeedai-desktop');

  app.on('open-url', (event: { preventDefault(): void }, url: string) => {
    event.preventDefault();
    void handleAuthCallback(url);
  });
};

const registerIpcHandlers = (): void => {
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appBootstrap, async () => getBootstrap());
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appEnableOfflineMode, async () => {
    isOfflineMode = true;
    kvService.setValueSync(OFFLINE_MODE_KEY, '1');
    await emitBootstrap();
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appGetDiagnostics, async () => ({
    isPackaged: app.isPackaged,
    platform: process.platform,
    releaseChannel: app.isPackaged ? 'production' : 'development',
    version: app.getVersion(),
  }));
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.appOpenExternalPath,
    async (_event: unknown, pathname: string) => {
      await shell.openExternal(
        buildExternalAppUrl(pathname, environment.authEndpoint),
      );
    },
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.authGetSession, async () =>
    sessionService.getSession(),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.authLogin, async () => {
    await shell.openExternal(sessionService.getLoginUrl());
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.authLogout, async () => {
    await sessionService.clearSession();
    await emitSession();
    await emitBootstrap();
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cloudListProjects, async () =>
    runDataService((service) => service.listProjects()),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGenerateHooks,
    async (_event: unknown, topic: string) =>
      runDataService((service) => service.generateHooks(topic)),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGenerateContent,
    async (_event: unknown, params: IDesktopGenerationOptions) => {
      try {
        return await runDataService((service) =>
          service.generateContent(params),
        );
      } finally {
        await emitBootstrap();
      }
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGetTrends,
    async (_event: unknown, platform: string) =>
      runDataService((service) => service.getTrends(platform)),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGetIngredients,
    async (_event: unknown, filter?: { limit?: number; platform?: string }) =>
      runDataService((service) => service.getIngredients(filter)),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudPublishPost,
    async (
      _event: unknown,
      params: { content: string; draftId?: string; platform: string },
    ) => runDataService((service) => service.publishPost(params)),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGetAnalytics,
    async (_event: unknown, params: { days: number }) =>
      runDataService((service) => service.getAnalytics(params)),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cloudListAgents, async () =>
    runDataService((service) => service.listAgents()),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudRunAgent,
    async (_event: unknown, agentId: string) =>
      runDataService((service) => service.runAgent(agentId)),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cloudListWorkflows, async () =>
    runDataService((service) => service.listWorkflows()),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudRunWorkflow,
    async (_event: unknown, params: { batch?: boolean; workflowId: string }) =>
      runDataService((service) => service.runWorkflow(params)),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.workspaceOpen, async () => {
    const workspace = await workspaceService.openWorkspace();
    await emitBootstrap();
    return workspace;
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.workspaceRecent, async () =>
    workspaceService.listRecentWorkspaces(),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.workspaceRead,
    async (_event: unknown, workspaceId: string) =>
      workspaceService.getWorkspace(workspaceId),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.workspaceLinkProject,
    async (_event: unknown, workspaceId: string, projectId: string) => {
      const workspace = await workspaceService.linkProject(
        workspaceId,
        projectId,
      );
      await emitBootstrap();
      return workspace;
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.workspaceReveal,
    async (_event: unknown, workspaceId: string) => {
      await workspaceService.revealInFinder(workspaceId);
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.draftsList,
    async (_event: unknown, workspaceId: string) =>
      draftsService.listDrafts(workspaceId),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.draftsGet,
    async (_event: unknown, workspaceId: string, draftId: string) =>
      draftsService.getDraft(workspaceId, draftId),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.draftsSave,
    async (
      _event: unknown,
      workspaceId: string,
      draft: IDesktopContentRunDraft,
    ) => draftsService.saveDraft(workspaceId, draft),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.draftsDelete,
    async (_event: unknown, workspaceId: string, draftId: string) => {
      await draftsService.deleteDraft(workspaceId, draftId);
      await emitBootstrap();
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.filesRead,
    async (_event: unknown, workspaceId: string, relativePath: string) =>
      filesService.readFile(workspaceId, relativePath),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.filesWrite,
    async (
      _event: unknown,
      workspaceId: string,
      relativePath: string,
      contents: string,
    ) => {
      await filesService.writeFile(workspaceId, relativePath, contents);
      await emitBootstrap();
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.filesImportAssets,
    async (_event: unknown, workspaceId: string, filePaths?: string[]) => {
      const importedAssets = await filesService.importAssets(
        workspaceId,
        filePaths,
      );
      await emitBootstrap();
      return importedAssets;
    },
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.generationGetProviderConfig, async () =>
    generationService.getPublicProviderConfig(),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.generationGenerateWorkflow,
    async (_event: unknown, params: IDesktopWorkflowGenerationOptions) =>
      generationService.generateWorkflow(params),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.generationSaveProviderConfig,
    async (_event: unknown, config: IDesktopGenerationProviderConfig) =>
      generationService.saveProviderConfig(config),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.generationClearProviderConfig,
    async () => {
      await generationService.clearProviderConfig();
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.generationTestProviderConfig,
    async (_event: unknown, config?: IDesktopGenerationProviderConfig) =>
      generationService.testProviderConfig(config),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.notify,
    async (_event: unknown, title: string, body: string) => {
      if (Notification.isSupported()) {
        void new Notification({ body, title }).show();
      }
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.syncGetJobs,
    async (_event: unknown, workspaceId?: string) =>
      syncService.listJobs(workspaceId),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.syncGetState, async () =>
    syncService.getState(),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.syncQueueJob,
    async (
      _event: unknown,
      type: string,
      payload: string,
      workspaceId?: string,
    ) => {
      const job = await syncService.queueJob(type, payload, workspaceId);
      await emitBootstrap();
      return job;
    },
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cacheGetPath, async () => {
    const cachePath = path.join(app.getPath('userData'), 'cache');
    fs.mkdirSync(cachePath, { recursive: true });
    return cachePath;
  });
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cacheWriteAsset,
    async (_event: unknown, filename: string, data: ArrayBuffer) => {
      const cachePath = path.join(app.getPath('userData'), 'cache');
      fs.mkdirSync(cachePath, { recursive: true });
      const filePath = path.join(cachePath, filename);
      fs.writeFileSync(filePath, Buffer.from(data));
      return filePath;
    },
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.openFileDialog, async () => {
    if (!mainWindow) {
      return { canceled: true, filePaths: [] };
    }
    return dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
    });
  });
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.getPlatform,
    async () => process.platform,
  );

  // Onboarding
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appGetOnboardingState, async () => ({
    completed: kvService.getValueSync(ONBOARDING_COMPLETED_KEY) === '1',
  }));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appSetOnboardingCompleted, async () => {
    kvService.setValueSync(ONBOARDING_COMPLETED_KEY, '1');
  });

  // Sync cursor (durable storage in main-process KV)
  ipcMain.handle(DESKTOP_IPC_CHANNELS.syncGetCursor, async () =>
    kvService.getValueSync(SYNC_THREADS_CURSOR_KEY),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.syncSetCursor,
    async (_event: unknown, cursor: string) => {
      kvService.setValueSync(SYNC_THREADS_CURSOR_KEY, cursor);
    },
  );

  // Sync trigger — pushes an event to the renderer which owns PGlite
  ipcMain.handle(DESKTOP_IPC_CHANNELS.syncTriggerThreads, async () => {
    mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.syncThreadsRequested);
    return { ok: true };
  });

  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.terminalCreate,
    async (event, options?: IDesktopTerminalCreateOptions) =>
      terminalService.createSession(
        options,
        (payload) => {
          event.sender.send(DESKTOP_IPC_CHANNELS.terminalData, payload);
        },
        (payload) => {
          event.sender.send(DESKTOP_IPC_CHANNELS.terminalExit, payload);
        },
      ),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.terminalWrite,
    async (_event: unknown, sessionId: string, data: string) => {
      terminalService.writeSession(sessionId, data);
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.terminalResize,
    async (_event: unknown, sessionId: string, cols: number, rows: number) => {
      terminalService.resizeSession(sessionId, cols, rows);
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.terminalKill,
    async (_event: unknown, sessionId: string) => {
      terminalService.killSession(sessionId);
    },
  );
};

app.on('before-quit', (event) => {
  if (isQuitting) {
    return;
  }

  event.preventDefault();
  isQuitting = true;

  void (async () => {
    try {
      terminalService.killAll();
      await appShellService.stop();
    } finally {
      shortcutsService.unregister();
      trayService.destroy();
      await prismaService.getClient().$disconnect();
      await pgliteService.close();
      app.quit();
    }
  })();
});

app.whenReady().then(async () => {
  telemetryService.init();
  pgliteService = new DesktopPgliteService(
    path.join(app.getPath('userData'), 'pglite-db'),
  );
  const pglite = await pgliteService.init();
  prismaService = new DesktopPrismaService(pglite);
  const prismaClient = prismaService.getClient();
  await prismaService.bootstrapLocalIdentity();
  await DesktopSqliteMigratorService.migrate(
    prismaClient,
    path.join(app.getPath('userData'), `${environment.appName}.sqlite`),
  );
  kvService = new DesktopKvService(prismaClient);
  await kvService.init();
  sessionService = new DesktopSessionService(kvService, environment);
  const session = await sessionService.validateStoredSession();
  if (session) {
    await kvService.setValue(LOCAL_CLERK_ID_KEY, session.userId);
  }
  workspaceService = new DesktopWorkspaceService(prismaClient);
  await workspaceService.init();
  syncService = new DesktopSyncService(prismaClient);
  await syncService.init();
  filesService = new DesktopFilesService(workspaceService);
  terminalService = new DesktopTerminalService(workspaceService);
  generationService = new DesktopGenerationService({
    deleteValue: (key) => kvService.deleteValue(key),
    getValue: (key) => kvService.getValue(key),
    setValue: (key, value) => kvService.setValue(key, value),
    upsertSyncJob: async (row) => {
      await prismaClient.desktopSyncJob.upsert({
        create: row,
        update: row,
        where: { id: row.id },
      });
    },
  });
  cloudService = new DesktopCloudService(environment, () =>
    sessionService.getSession(),
  );
  localService = new DesktopLocalService(prismaClient);
  draftsService = new DesktopDraftsService(workspaceService);
  appShellService = new DesktopAppShellService(
    environment,
    () => sessionService.getSession(),
    () => pgliteService.getDataDir(),
  );
  isOfflineMode = kvService.getValueSync(OFFLINE_MODE_KEY) === '1';
  telemetryService.setUser(sessionService.getSession());
  process.on('uncaughtException', (error) => {
    telemetryService.captureException(error, { source: 'uncaughtException' });
  });
  process.on('unhandledRejection', (error) => {
    telemetryService.captureException(error, { source: 'unhandledRejection' });
  });
  registerProtocolHandling();
  registerIpcHandlers();
  await createWindow();

  if (mainWindow) {
    trayService.initialize(mainWindow, emitQuickGenerate);
    shortcutsService.register(mainWindow, emitQuickGenerate);
  }

  const deepLinkArgument = process.argv.find((value: string) =>
    value.startsWith('genfeedai-desktop://'),
  );

  if (deepLinkArgument) {
    void handleAuthCallback(deepLinkArgument);
  }

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      void createWindow();
    }
  });
});

app.on('second-instance', (_event: unknown, argv: string[]) => {
  const deepLinkArgument = argv.find((value: string) =>
    value.startsWith('genfeedai-desktop://'),
  );

  if (deepLinkArgument) {
    void handleAuthCallback(deepLinkArgument);
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
