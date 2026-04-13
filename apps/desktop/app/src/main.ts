import fs from 'node:fs';
import path from 'node:path';
import type {
  IDesktopBootstrap,
  IDesktopContentRunDraft,
  IDesktopGenerationOptions,
} from '@genfeedai/desktop-contracts';
import { DESKTOP_IPC_CHANNELS } from '@genfeedai/desktop-contracts';
import {
  buildShellMenu,
  ShellShortcutsService,
  ShellTelemetryService,
  ShellTrayService,
} from '@genfeedai/desktop-shell';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  shell,
} from 'electron';
import { DesktopAppShellService } from './main/app-shell.service';
import { DesktopCloudService } from './main/cloud.service';
import { CloudDatabaseService } from './main/cloud-database.service';
import { DesktopConfigService } from './main/config.service';
import { DesktopDraftsService } from './main/drafts.service';
import { DesktopFilesService } from './main/files.service';
import { DesktopSessionService } from './main/session.service';
import { DesktopSyncService } from './main/sync.service';
import { DesktopWorkspaceService } from './main/workspace.service';

const configService = new DesktopConfigService();
const environment = configService.getEnvironment();

let mainWindow: BrowserWindow | null = null;

const database = new CloudDatabaseService();
const sessionService = new DesktopSessionService(database, environment);
const workspaceService = new DesktopWorkspaceService(database);
const filesService = new DesktopFilesService(workspaceService);
const syncService = new DesktopSyncService(database);
const cloudService = new DesktopCloudService(environment);
const draftsService = new DesktopDraftsService(workspaceService);
const appShellService = new DesktopAppShellService(
  environment,
  () => sessionService.getSession(),
  database.getDatabasePath(),
);

const telemetryService = new ShellTelemetryService();

const trayService = new ShellTrayService();
const shortcutsService = new ShellShortcutsService();

let isQuitting = false;
const isSmokeTest =
  process.argv.includes('--smoke-test') ||
  process.env.GENFEED_DESKTOP_SMOKE_TEST === '1';

const emitQuickGenerate = (): void => {
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.quickGenerate);
};

const emitSession = (): void => {
  const session = sessionService.getSession();
  telemetryService.setUser(
    session
      ? { email: session.userEmail, id: session.userId, name: session.userName }
      : null,
  );
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.authChanged, session);
};

const emitBootstrap = (): void => {
  mainWindow?.webContents.send(
    DESKTOP_IPC_CHANNELS.bootstrapChanged,
    getBootstrap(),
  );
};

const getBootstrap = (): IDesktopBootstrap => ({
  environment: sessionService.getEnvironment(),
  preferences: {
    nativeNotificationsEnabled: Notification.isSupported(),
  },
  recents: workspaceService.listRecents(),
  session: sessionService.getSession(),
  syncState: syncService.getState(),
  workspaces: workspaceService.listRecentWorkspaces(),
});

const acquiredSingleInstanceLock = app.requestSingleInstanceLock();

if (!acquiredSingleInstanceLock) {
  app.quit();
}

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    backgroundColor: '#08111f',
    height: 980,
    minHeight: 780,
    minWidth: 1280,
    show: false,
    title: 'Genfeed Desktop',
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

  mainWindow.webContents.on('did-finish-load', () => {
    if (isSmokeTest) {
      setTimeout(() => app.exit(0), 250);
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
    await appShellService.start();
    await mainWindow.loadURL(
      appShellService.buildInitialUrl(sessionService.getSession()),
    );
  } catch (error) {
    telemetryService.captureException(error, {
      surface: 'app-shell',
    });

    if (isSmokeTest) {
      app.exit(1);
      return;
    }

    await mainWindow.loadURL(
      `data:text/html,${encodeURIComponent(
        '<html><body style="background:#08111f;color:#fff;font-family:sans-serif;padding:32px"><h1>Genfeed Desktop</h1><p>Failed to start the embedded app shell.</p></body></html>',
      )}`,
    );
  }

  buildShellMenu(mainWindow, {
    fileItems: [
      {
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          void workspaceService.openWorkspace().then(() => {
            emitBootstrap();
            mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.toggleSidebar);
          });
        },
        label: 'Open Workspace',
      },
    ],
    viewItems: [
      {
        accelerator: 'CmdOrCtrl+\\',
        click: () => {
          mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.toggleSidebar);
        },
        label: 'Toggle Workspace Sidebar',
      },
    ],
  });
};

const handleAuthCallback = async (rawUrl: string): Promise<void> => {
  const session = await sessionService.handleCallback(rawUrl);

  if (!session) {
    return;
  }

  emitSession();
  emitBootstrap();
  void new Notification({
    body: session.userEmail || 'Authenticated successfully.',
    title: 'Genfeed Desktop',
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
    sessionService.clearSession();
    emitSession();
    emitBootstrap();
  });
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cloudListProjects, async () =>
    cloudService.listProjects(sessionService.getSession()),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGenerateHooks,
    async (_event: unknown, topic: string) =>
      cloudService.generateHooks(sessionService.getSession(), topic),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGenerateContent,
    async (_event: unknown, params: IDesktopGenerationOptions) =>
      cloudService.generateContent(sessionService.getSession(), params),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGetTrends,
    async (_event: unknown, platform: string) =>
      cloudService.getTrends(sessionService.getSession(), platform),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGetIngredients,
    async (_event: unknown, filter?: { limit?: number; platform?: string }) =>
      cloudService.getIngredients(sessionService.getSession(), filter),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudPublishPost,
    async (
      _event: unknown,
      params: { content: string; draftId?: string; platform: string },
    ) => cloudService.publishPost(sessionService.getSession(), params),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudGetAnalytics,
    async (_event: unknown, params: { days: number }) =>
      cloudService.getAnalytics(sessionService.getSession(), params),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cloudListAgents, async () =>
    cloudService.listAgents(sessionService.getSession()),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudRunAgent,
    async (_event: unknown, agentId: string) =>
      cloudService.runAgent(sessionService.getSession(), agentId),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.cloudListWorkflows, async () =>
    cloudService.listWorkflows(sessionService.getSession()),
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.cloudRunWorkflow,
    async (_event: unknown, params: { batch?: boolean; workflowId: string }) =>
      cloudService.runWorkflow(sessionService.getSession(), params),
  );
  ipcMain.handle(DESKTOP_IPC_CHANNELS.workspaceOpen, async () => {
    const workspace = await workspaceService.openWorkspace();
    emitBootstrap();
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
      const workspace = workspaceService.linkProject(workspaceId, projectId);
      emitBootstrap();
      return workspace;
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.workspaceReveal,
    async (_event: unknown, workspaceId: string) => {
      workspaceService.revealInFinder(workspaceId);
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
      emitBootstrap();
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
      emitBootstrap();
    },
  );
  ipcMain.handle(
    DESKTOP_IPC_CHANNELS.filesImportAssets,
    async (_event: unknown, workspaceId: string, filePaths?: string[]) => {
      const importedAssets = await filesService.importAssets(
        workspaceId,
        filePaths,
      );
      emitBootstrap();
      return importedAssets;
    },
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
      const job = syncService.queueJob(type, payload, workspaceId);
      emitBootstrap();
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
};

app.on('before-quit', () => {
  isQuitting = true;
  shortcutsService.unregister();
  trayService.destroy();
  void appShellService.stop();
});

app.whenReady().then(async () => {
  telemetryService.init();
  telemetryService.setUser(
    sessionService.getSession()
      ? {
          email: sessionService.getSession()?.userEmail,
          id: sessionService.getSession()?.userId ?? '',
          name: sessionService.getSession()?.userName,
        }
      : null,
  );
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
    trayService.initialize(mainWindow, {
      appName: 'Genfeed Desktop',
      contextMenuItems: [
        {
          click: () => {
            mainWindow?.show();
            mainWindow?.focus();
            emitQuickGenerate();
          },
          label: 'Quick Generate',
        },
        { label: '', type: 'separator' },
        {
          enabled: false,
          label: 'Sync Status: Idle',
        },
      ],
      iconPath: path.join(__dirname, 'assets', 'tray-icon.png'),
      tooltip: 'Genfeed Desktop',
    });

    shortcutsService.register(mainWindow, [
      {
        accelerator: 'CommandOrControl+Shift+G',
        callback: (win) => {
          if (win.isVisible()) {
            win.focus();
          } else {
            win.show();
            win.focus();
          }
        },
      },
      {
        accelerator: 'CommandOrControl+Shift+N',
        callback: (win) => {
          win.show();
          win.focus();
          emitQuickGenerate();
        },
      },
    ]);
  }

  const deepLinkArgument = process.argv.find((value: string) =>
    value.startsWith('genfeedai-desktop://'),
  );

  if (deepLinkArgument) {
    handleAuthCallback(deepLinkArgument);
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
    handleAuthCallback(deepLinkArgument);
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
