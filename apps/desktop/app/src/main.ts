import fs from 'node:fs';
import path from 'node:path';
import type {
  IDesktopBootstrap,
  IDesktopContentRunDraft,
  IDesktopDataService,
  IDesktopGenerationOptions,
  IDesktopGenerationProviderConfig,
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
import { DesktopDatabaseService } from './main/database.service';
import { DesktopDraftsService } from './main/drafts.service';
import { DesktopFilesService } from './main/files.service';
import { DesktopGenerationService } from './main/generation.service';
import { DesktopLocalService } from './main/local.service';
import { LocalIdentityService } from './main/local-identity.service';
import { buildDesktopMenu } from './main/menu.service';
import { DesktopPrismaService } from './main/prisma.service';
import { DesktopSessionService } from './main/session.service';
import { DesktopShortcutsService } from './main/shortcuts.service';
import { DesktopSyncService } from './main/sync.service';
import { DesktopTelemetryService } from './main/telemetry.service';
import { DesktopTrayService } from './main/tray.service';
import { DesktopWorkspaceService } from './main/workspace.service';

const configService = new DesktopConfigService();
const environment = configService.getEnvironment();

let mainWindow: BrowserWindow | null = null;

const prismaService = new DesktopPrismaService();
const database = new DesktopDatabaseService(prismaService);
const localIdentityService = new LocalIdentityService(database);
const sessionService = new DesktopSessionService(database, environment);
const workspaceService = new DesktopWorkspaceService(database);
const filesService = new DesktopFilesService(workspaceService);
const syncService = new DesktopSyncService(database);
const generationService = new DesktopGenerationService(database);
const cloudService = new DesktopCloudService(environment, () =>
  sessionService.getSession(),
);
const localService = new DesktopLocalService(
  prismaService,
  generationService,
  () => ({
    clerkId: localIdentityService.getClerkId(),
    localUserId: localIdentityService.getLocalUserId(),
    userEmail: sessionService.getSession()?.userEmail,
    userName: sessionService.getSession()?.userName,
  }),
);
const draftsService = new DesktopDraftsService(workspaceService);
const appShellService = new DesktopAppShellService(
  environment,
  () => sessionService.getSession(),
  database.getDatabasePath(),
);

const telemetryService = new DesktopTelemetryService(environment);

const trayService = new DesktopTrayService();
const shortcutsService = new DesktopShortcutsService();

let isQuitting = false;
const isSmokeTest =
  process.argv.includes('--smoke-test') ||
  process.env.GENFEED_DESKTOP_SMOKE_TEST === '1';

const emitQuickGenerate = (): void => {
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.quickGenerate);
};

const emitSession = (): void => {
  const session = sessionService.getSession();
  telemetryService.setUser(session);
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.authChanged, session);
};

const emitBootstrap = async (): Promise<void> => {
  mainWindow?.webContents.send(
    DESKTOP_IPC_CHANNELS.bootstrapChanged,
    await getBootstrap(),
  );
};

const getBootstrap = async (): Promise<IDesktopBootstrap> => {
  const [recents, syncState, workspaces] = await Promise.all([
    workspaceService.listRecents(),
    syncService.getState(),
    workspaceService.listRecentWorkspaces(),
  ]);

  return {
    clerkId: localIdentityService.getClerkId(),
    environment: sessionService.getEnvironment(),
    localUserId: localIdentityService.getLocalUserId(),
    preferences: {
      nativeNotificationsEnabled: Notification.isSupported(),
    },
    recents,
    session: sessionService.getSession(),
    syncState,
    workspaces,
  };
};

const runDataService = async <T>(
  operation: string,
  callback: (service: IDesktopDataService) => Promise<T>,
): Promise<T> => {
  if (!sessionService.getSession()) {
    return callback(localService);
  }

  try {
    return await callback(cloudService);
  } catch (cloudError) {
    telemetryService.captureException(cloudError, {
      operation,
      surface: 'desktop-cloud-fallback',
    });

    try {
      return await callback(localService);
    } catch (localError) {
      const localMessage =
        localError instanceof Error ? localError.message : String(localError);

      if (localMessage.includes('Configure a local generation provider')) {
        throw new Error(
          'Cloud request failed and local generation is not configured. Add a local provider in Settings > API Keys, then try again.',
        );
      }

      throw localError;
    }
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
    emitSession();
    await emitBootstrap();
    if (Notification.isSupported()) {
      void new Notification({
        body: 'The browser returned an invalid or expired desktop sign-in key. Start sign-in again from the desktop app.',
        title: 'Desktop authentication failed',
      }).show();
    }
    return;
  }

  await localIdentityService.setClerkId(session.userId);
  await localService.ensureBootstrapData();
  emitSession();
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
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appGetDiagnostics, async () => ({
    isPackaged: app.isPackaged,
    platform: process.platform,
    releaseChannel: app.isPackaged ? 'production' : 'development',
    version: app.getVersion(),
  }));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.authGetSession, async () =>
    sessionService.getSession(),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.authLogin, async () => {
    await shell.openExternal(sessionService.getLoginUrl());
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.authLogout, async () => {
    await sessionService.clearSession();
    await localService.ensureBootstrapData();
    emitSession();
    await emitBootstrap();
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cloudListProjects, async () =>
    runDataService('listProjects', (service) => service.listProjects()),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGenerateHooks,
    async (_event: unknown, topic: string) =>
      runDataService('generateHooks', (service) =>
        service.generateHooks(topic),
      ),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGenerateContent,
    async (_event: unknown, params: IDesktopGenerationOptions) => {
      try {
        return await runDataService('generateContent', (service) =>
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
      runDataService('getTrends', (service) => service.getTrends(platform)),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGetIngredients,
    async (_event: unknown, filter?: { limit?: number; platform?: string }) =>
      runDataService('getIngredients', (service) =>
        service.getIngredients(filter),
      ),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudPublishPost,
    async (
      _event: unknown,
      params: { content: string; draftId?: string; platform: string },
    ) =>
      runDataService('publishPost', (service) => service.publishPost(params)),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGetAnalytics,
    async (_event: unknown, params: { days: number }) =>
      runDataService('getAnalytics', (service) => service.getAnalytics(params)),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cloudListAgents, async () =>
    runDataService('listAgents', (service) => service.listAgents()),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudRunAgent,
    async (_event: unknown, agentId: string) =>
      runDataService('runAgent', (service) => service.runAgent(agentId)),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cloudListWorkflows, async () =>
    runDataService('listWorkflows', (service) => service.listWorkflows()),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudRunWorkflow,
    async (_event: unknown, params: { batch?: boolean; workflowId: string }) =>
      runDataService('runWorkflow', (service) => service.runWorkflow(params)),
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
    completed: localIdentityService.getOnboardingCompleted(),
  }));
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appSetOnboardingCompleted, async () => {
    await localIdentityService.setOnboardingCompleted();
  });

  // Sync cursor (durable storage in main-process KV)
  ipcMain.handle(DESKTOP_IPC_CHANNELS.syncGetCursor, async () =>
    localIdentityService.getSyncCursor(),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.syncSetCursor,
    async (_event: unknown, cursor: string) => {
      await localIdentityService.setSyncCursor(cursor);
    },
  );

  // Sync trigger — pushes an event to the renderer which owns PGlite
  ipcMain.handle(DESKTOP_IPC_CHANNELS.syncTriggerThreads, async () => {
    mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.syncThreadsRequested);
    return { ok: true };
  });
};

app.on('before-quit', (event) => {
  if (isQuitting) {
    return;
  }

  event.preventDefault();
  isQuitting = true;

  void (async () => {
    try {
      await appShellService.stop();
    } finally {
      shortcutsService.unregister();
      trayService.destroy();
      await database.close();
      app.quit();
    }
  })();
});

app.whenReady().then(async () => {
  telemetryService.init();
  await localIdentityService.initialize();
  await sessionService.initialize();
  const session = await sessionService.validateStoredSession();
  if (session) {
    await localIdentityService.setClerkId(session.userId);
  }
  await localService.ensureBootstrapData();
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
