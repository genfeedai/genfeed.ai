import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DesktopSyncCursorScope,
  IDesktopAssetGenerationRequest,
  IDesktopAssetSyncUpdate,
  IDesktopAuthoritySummary,
  IDesktopBootstrap,
  IDesktopBrandManifest,
  IDesktopContentRunDraft,
  IDesktopDataResult,
  IDesktopDataService,
  IDesktopGenerationOptions,
  IDesktopGenerationProviderConfig,
  IDesktopSyncConsentInput,
  IDesktopSyncOpAck,
  IDesktopTerminalCreateOptions,
  IDesktopWorkflowGenerationOptions,
  IDesktopWorkspaceCloudLinkInput,
} from '@genfeedai/contracts/desktop';
import { DESKTOP_IPC_CHANNELS } from '@genfeedai/contracts/desktop';
import {
  app,
  BrowserWindow,
  dialog,
  session as electronSession,
  type IpcMainInvokeEvent,
  ipcMain,
  Notification,
  nativeTheme,
  shell,
} from 'electron';
import electronUpdater from 'electron-updater';
import { DesktopAppShellService } from './main/app-shell.service';
import {
  DesktopAssetProtocolService,
  registerDesktopAssetScheme,
} from './main/asset-protocol.service';
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
import { LocalIdentityService } from './main/local-identity.service';
import { detectDesktopLocalTools } from './main/local-tools.util';
import { DesktopLogService } from './main/log.service';
import { buildDesktopMenu } from './main/menu.service';
import type { DesktopPgliteService } from './main/pglite.service';
import type { DesktopPrismaService } from './main/prisma.service';
import {
  createDesktopProcessExceptionHandler,
  DESKTOP_PROCESS_EXCEPTION_SOURCE,
} from './main/process-exceptions.util';
import {
  activateDesktopLocalMode,
  createLocalRuntimeCleanupBarrier,
  createUnwoundLocalRuntimeState,
  restoreDesktopRuntimeMode,
  selectDesktopDataService,
  switchDesktopToCloud,
  type UnwoundLocalRuntimeState,
  unwindFailedLocalRuntimeAfterClose,
} from './main/runtime-mode.util';
import {
  type DesktopAuthCallbackResult,
  DesktopSessionService,
  type IDesktopSession,
} from './main/session.service';
import { DesktopShortcutsService } from './main/shortcuts.service';
import { DesktopStoreService } from './main/store.service';
import { DesktopSyncService } from './main/sync.service';
import {
  assertActiveSyncAccount,
  DesktopSyncConsentService,
  getAccountScopedSyncCursorKey,
} from './main/sync-consent.service';
import { DesktopTelemetryService } from './main/telemetry.service';
import { DesktopTerminalService } from './main/terminal.service';
import { DesktopTrayService } from './main/tray.service';
import { DesktopUpdaterService } from './main/updater.service';
import type { DesktopWindowClosePolicy } from './main/window-lifecycle.util';
import {
  DESKTOP_WINDOW_CLOSE_POLICY,
  handleDesktopWindowClose,
  handleDesktopWindowClosed,
} from './main/window-lifecycle.util';
import { DesktopWorkspaceService } from './main/workspace.service';

const configService = new DesktopConfigService();
const environment = configService.getEnvironment();
const mainDir = path.dirname(fileURLToPath(import.meta.url));

registerDesktopAssetScheme();

const { autoUpdater } = electronUpdater;

let mainWindow: BrowserWindow | null = null;
let bootstrapCache: IDesktopBootstrap | null = null;
let pgliteService: DesktopPgliteService | null = null;
let prismaService: DesktopPrismaService | null = null;
let desktopStore: DesktopStoreService;
let kvService: DesktopKvService | null = null;
let localIdentityService: LocalIdentityService | null = null;
let sessionService: DesktopSessionService;
let workspaceService: DesktopWorkspaceService | null = null;
let filesService: DesktopFilesService | null = null;
let syncService: DesktopSyncService | null = null;
let syncConsentService: DesktopSyncConsentService;
let terminalService: DesktopTerminalService | null = null;
let generationService: DesktopGenerationService | null = null;
let cloudService: DesktopCloudService;
let localService: DesktopLocalService | null = null;
let draftsService: DesktopDraftsService | null = null;
let appShellService: DesktopAppShellService;
let isOfflineMode = false;
let localRuntimePromise: Promise<void> | null = null;
let localRuntimeCleanupBarrier: Promise<void> = Promise.resolve();
let localRuntimeAttemptId = 0;
let assetProtocolRegistered = false;
let logService: DesktopLogService | null = null;

function applyUnwoundLocalRuntime(
  reset: UnwoundLocalRuntimeState = createUnwoundLocalRuntimeState(),
): void {
  pgliteService = reset.pgliteService;
  prismaService = reset.prismaService;
  kvService = reset.kvService;
  localIdentityService = reset.localIdentityService;
  workspaceService = reset.workspaceService;
  syncService = reset.syncService;
  filesService = reset.filesService;
  terminalService = reset.terminalService;
  generationService = reset.generationService;
  draftsService = reset.draftsService;
  localService = reset.localService;
  isOfflineMode = reset.isOfflineMode;
  bootstrapCache = reset.bootstrapCache;
  localRuntimePromise = reset.localRuntimePromise;
}

function requireLocalService<TService>(service: TService | null): TService {
  if (!service) {
    throw new Error(
      'Local mode is not enabled. Select Local workspace before using this feature.',
    );
  }

  return service;
}

const telemetryService = new DesktopTelemetryService(environment);

const trayService = new DesktopTrayService();
const shortcutsService = new DesktopShortcutsService();

const EXTERNAL_NAVIGATION_HOSTS = new Set([
  'app.genfeed.ai',
  'genfeed.ai',
  'www.genfeed.ai',
  new URL(environment.authEndpoint).hostname,
]);
const ALLOWED_PERMISSIONS = new Set([
  'clipboard-sanitized-write',
  'notifications',
]);

let isQuitting = false;
let windowClosePolicy: DesktopWindowClosePolicy =
  DESKTOP_WINDOW_CLOSE_POLICY.HIDE_ON_CLOSE;
const isSmokeTest =
  process.argv.includes('--smoke-test') ||
  process.env.GENFEED_DESKTOP_SMOKE_TEST === '1';
const isVisualQa =
  process.argv.includes('--visual-qa') ||
  process.env.GENFEED_DESKTOP_VISUAL_QA === '1';
const smokeUserDataDir =
  isSmokeTest || isVisualQa
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'genfeed-desktop-smoke-'))
    : null;

if (smokeUserDataDir) {
  app.setPath('userData', smokeUserDataDir);
}

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
  name: 'Local Desktop User',
  organizationId: LOCAL_ORGANIZATION.id,
} as const;
const DESKTOP_AUTHORITY: IDesktopAuthoritySummary = {
  cloud: ['organization-membership', 'roles', 'shared-brand-settings'],
  local: [
    'private-drafts',
    'local-generation',
    'imported-files',
    'unsynced-assets',
  ],
};
const OFFLINE_MODE_KEY = 'desktop.runtime.mode';
const ACTIVE_WORKSPACE_ID_KEY = 'desktop.workspace.activeId';

function getSyncCursorKey(
  cloudUserId: string,
  scope: DesktopSyncCursorScope = 'threads',
): string {
  assertActiveSyncAccount(sessionService.getSession(), cloudUserId);
  return getAccountScopedSyncCursorKey(cloudUserId, scope);
}

function getBetterAuthId(): string | null {
  return (
    localIdentityService?.getBetterAuthId() ??
    sessionService?.getSession()?.userId ??
    null
  );
}

function getLocalCloudIdentityContext() {
  if (!localIdentityService) {
    throw new Error('Select local mode before using a local workspace.');
  }

  return {
    cloudUserId: getBetterAuthId(),
    localDeviceId: localIdentityService.getLocalDeviceId(),
    localUserId: localIdentityService.getLocalUserId(),
  };
}

const getCloudIdentityStatus = (
  session: IDesktopBootstrap['session'],
  betterAuthId: string | null,
) => (session ? 'connected' : betterAuthId ? 'signed-out' : 'never-connected');

const persistDeviceIdentity = async (
  session: IDesktopBootstrap['session'],
  activePrismaService: DesktopPrismaService | null = prismaService,
  activeLocalIdentityService: LocalIdentityService | null = localIdentityService,
): Promise<void> => {
  const client = activePrismaService?.getClient();

  if (!client || !activeLocalIdentityService) {
    return;
  }

  const now = new Date().toISOString();
  const localDeviceId = activeLocalIdentityService.getLocalDeviceId();
  const betterAuthId =
    activeLocalIdentityService.getBetterAuthId() ?? session?.userId ?? null;
  const existing = await client.desktopDeviceIdentity.findUnique({
    where: {
      id: localDeviceId,
    },
  });

  await client.desktopDeviceIdentity.upsert({
    create: {
      cloudUserEmail: session?.userEmail ?? null,
      cloudUserId: betterAuthId,
      connectedAt: session?.issuedAt ?? null,
      createdAt: now,
      id: localDeviceId,
      lastSeenAt: now,
      localUserId: activeLocalIdentityService.getLocalUserId(),
      status: getCloudIdentityStatus(session, betterAuthId),
      updatedAt: now,
    },
    update: {
      cloudUserEmail: session?.userEmail ?? existing?.cloudUserEmail ?? null,
      cloudUserId: betterAuthId ?? existing?.cloudUserId ?? null,
      connectedAt: session?.issuedAt ?? existing?.connectedAt ?? null,
      lastSeenAt: now,
      localUserId: activeLocalIdentityService.getLocalUserId(),
      status: getCloudIdentityStatus(session, betterAuthId),
      updatedAt: now,
    },
    where: {
      id: localDeviceId,
    },
  });
};

const getActiveWorkspaceId = (
  workspaces = workspaceService?.listRecentWorkspaces() ?? [],
): string | null => {
  const storedWorkspaceId = kvService?.getValueSync(ACTIVE_WORKSPACE_ID_KEY);

  if (
    storedWorkspaceId &&
    workspaces.some((workspace) => workspace.id === storedWorkspaceId)
  ) {
    return storedWorkspaceId;
  }

  return workspaces[0]?.id ?? null;
};

const setActiveWorkspaceId = async (workspaceId: string): Promise<void> => {
  if (!workspaceService || !kvService) {
    throw new Error('Select local mode before choosing a workspace.');
  }

  requireLocalService(workspaceService).getWorkspace(workspaceId);
  await requireLocalService(kvService).setValue(
    ACTIVE_WORKSPACE_ID_KEY,
    workspaceId,
  );
};

function getDataService(): IDesktopDataService {
  return selectDesktopDataService<IDesktopDataService>({
    cloudService,
    hasCloudSession: Boolean(sessionService.getSession()),
    isOfflineMode,
    localService,
  });
}

const emitQuickGenerate = (): void => {
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.quickGenerate);
};

const emitSession = async (): Promise<void> => {
  const session = sessionService.getSession();
  telemetryService.setUser(session);
  // The API key is a main-process credential and never crosses into the page.
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.authChanged, null);
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

  const workspaces = workspaceService?.listRecentWorkspaces() ?? [];
  const session = sessionService.getSession();
  const betterAuthId = getBetterAuthId();
  const localUserId = localIdentityService?.getLocalUserId() ?? 'local-user';
  const bootstrap: IDesktopBootstrap = {
    activeWorkspaceId: getActiveWorkspaceId(workspaces),
    authority: DESKTOP_AUTHORITY,
    betterAuthId,
    cloudIdentity: {
      cloudUserEmail: session?.userEmail,
      cloudUserId: betterAuthId ?? undefined,
      connectedAt: session?.issuedAt,
      localDeviceId: localIdentityService?.getLocalDeviceId() ?? 'local-device',
      localUserId,
      status: getCloudIdentityStatus(session, betterAuthId),
    },
    cloudOrganizations: syncService?.listCloudOrganizations() ?? [],
    environment: sessionService.getEnvironment(),
    isOfflineMode,
    localOrganization: { ...LOCAL_ORGANIZATION },
    localUser: {
      ...LOCAL_USER,
      id: localUserId,
      userEmail: session?.userEmail,
    },
    localUserId,
    preferences: {
      nativeNotificationsEnabled: Notification.isSupported(),
    },
    brands: syncService?.listBrands() ?? [],
    recents: workspaceService?.listRecents() ?? [],
    // Better Auth state is carried by the HttpOnly shell cookie. The API key
    // stays in main for request-header injection and is never serialized here.
    session: null,
    syncConsent: syncConsentService.getConsent(session),
    syncState: syncService?.getState() ?? {
      failedCount: 0,
      pendingCount: 0,
      retryingCount: 0,
      runningCount: 0,
    },
    workspaces,
  };

  bootstrapCache = bootstrap;
  return bootstrap;
};

const runDataService = async <T>(
  callback: (service: IDesktopDataService) => Promise<IDesktopDataResult<T>>,
): Promise<T> => {
  try {
    const result = await callback(getDataService());
    return result.data;
  } catch (error) {
    if (isLocalProviderRequiredError(error)) {
      throw new Error(CLOUD_CREDITS_OR_LOCAL_PROVIDER_ERROR);
    }

    throw error;
  }
};

const initializeLocalRuntime = async (): Promise<void> => {
  await localRuntimeCleanupBarrier;

  if (localRuntimePromise) {
    return localRuntimePromise;
  }

  const attemptId = ++localRuntimeAttemptId;
  localRuntimePromise = (async () => {
    let nextPgliteService: DesktopPgliteService | null = null;

    try {
      const [{ DesktopPgliteService }, { DesktopPrismaService }] =
        await Promise.all([
          import('./main/pglite.service'),
          import('./main/prisma.service'),
        ]);
      nextPgliteService = new DesktopPgliteService(
        path.join(app.getPath('userData'), 'pglite-db'),
      );

      const pglite = await nextPgliteService.init();
      if (nextPgliteService.didResetUnsupportedDatabase()) {
        logService?.info(
          'Discarded an unsupported pre-release local database before initializing the current desktop schema.',
        );
      }
      const nextPrismaService = new DesktopPrismaService(pglite);
      const prismaClient = nextPrismaService.getClient();
      const nextKvService = new DesktopKvService(prismaClient);
      await nextKvService.init();

      const nextLocalIdentityService = new LocalIdentityService(nextKvService);
      await nextLocalIdentityService.initialize();
      await nextPrismaService.bootstrapLocalIdentity(
        nextLocalIdentityService.getLocalUserId(),
      );

      const session = sessionService.getSession();
      if (session) {
        await nextLocalIdentityService.setBetterAuthId(session.userId);
      }

      const nextWorkspaceService = new DesktopWorkspaceService(prismaClient);
      await nextWorkspaceService.init();
      const nextSyncService = new DesktopSyncService(prismaClient);
      await nextSyncService.init();
      const nextFilesService = new DesktopFilesService(
        nextWorkspaceService,
        prismaClient,
      );
      const nextGenerationService = new DesktopGenerationService(
        {
          deleteValue: (key) => nextKvService.deleteValue(key),
          getSyncJob: async (jobId) =>
            prismaClient.desktopSyncJob.findUnique({ where: { id: jobId } }),
          getValue: (key) => nextKvService.getValue(key),
          listSyncJobs: async (type, workspaceId) =>
            prismaClient.desktopSyncJob.findMany({
              orderBy: { updatedAt: 'desc' },
              where: { type, ...(workspaceId ? { workspaceId } : {}) },
            }),
          setValue: (key, value) => nextKvService.setValue(key, value),
          upsertSyncJob: async (row) => {
            await prismaClient.desktopSyncJob.upsert({
              create: row,
              update: row,
              where: { id: row.id },
            });
          },
        },
        configService,
        nextFilesService,
      );
      await nextGenerationService.resumeAssetGenerationJobs();
      const nextTerminalService = new DesktopTerminalService(
        nextWorkspaceService,
      );
      const nextLocalService = new DesktopLocalService(
        prismaClient,
        nextGenerationService,
      );
      const nextDraftsService = new DesktopDraftsService(nextWorkspaceService);

      await persistDeviceIdentity(
        session,
        nextPrismaService,
        nextLocalIdentityService,
      );

      if (attemptId !== localRuntimeAttemptId) {
        throw new Error(
          'Local runtime initialization attempt was invalidated.',
        );
      }

      if (!assetProtocolRegistered) {
        new DesktopAssetProtocolService(nextFilesService).register();
        assetProtocolRegistered = true;
      }

      // Publish the runtime atomically after every fallible initialization step.
      // A failed attempt must not leave globals backed by a closed database.
      pgliteService = nextPgliteService;
      prismaService = nextPrismaService;
      kvService = nextKvService;
      localIdentityService = nextLocalIdentityService;
      workspaceService = nextWorkspaceService;
      syncService = nextSyncService;
      filesService = nextFilesService;
      terminalService = nextTerminalService;
      generationService = nextGenerationService;
      localService = nextLocalService;
      draftsService = nextDraftsService;
      isOfflineMode = true;
      bootstrapCache = null;
    } catch (error) {
      await unwindFailedLocalRuntimeAfterClose({
        applyReset: (reset) => {
          if (attemptId === localRuntimeAttemptId) {
            applyUnwoundLocalRuntime(reset);
          }
        },
        closeDatabase: async () => {
          await nextPgliteService?.close();
        },
      });
      throw error;
    }
  })();

  return localRuntimePromise;
};

const invalidateLocalRuntimeAttempt = (): void => {
  localRuntimeAttemptId += 1;
  localRuntimeCleanupBarrier =
    createLocalRuntimeCleanupBarrier(localRuntimePromise);
  localRuntimePromise = null;
};

const requireLocalRuntime = (): void => {
  if (!isOfflineMode || !localService) {
    throw new Error(
      'Local mode is not enabled. Select Local workspace before using this feature.',
    );
  }
};

const acquiredSingleInstanceLock = app.requestSingleInstanceLock();

if (!acquiredSingleInstanceLock) {
  app.quit();
}

const getAllowedExternalUrl = (rawUrl: string): URL | null => {
  try {
    const url = new URL(rawUrl);

    if (
      url.password ||
      url.protocol !== 'https:' ||
      url.username ||
      !EXTERNAL_NAVIGATION_HOSTS.has(url.hostname)
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
};

const openAllowedExternalUrl = (rawUrl: string): boolean => {
  const url = getAllowedExternalUrl(rawUrl);

  if (!url) {
    return false;
  }

  void shell.openExternal(url.toString());
  return true;
};

const openValidatedExternalUrl = async (rawUrl: string): Promise<void> => {
  const url = getAllowedExternalUrl(rawUrl);

  if (!url) {
    throw new Error('Desktop refused to open an untrusted external URL.');
  }

  await shell.openExternal(url.toString());
};

const isShellOrigin = (rawUrl: string): boolean => {
  try {
    return new URL(rawUrl).origin === appShellService.appOrigin;
  } catch {
    return false;
  }
};

const assertTrustedIpcSender = (event: IpcMainInvokeEvent): void => {
  const senderFrame = event.senderFrame;

  if (
    !senderFrame ||
    senderFrame !== event.sender.mainFrame ||
    !isShellOrigin(senderFrame.url)
  ) {
    throw new Error('Desktop IPC rejected an untrusted sender.');
  }
};

const registerPrivilegedIpcHandler = <TArguments extends unknown[], TResult>(
  channel: string,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: TArguments
  ) => Promise<TResult> | TResult,
): void => {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertTrustedIpcSender(event);
    if (LOCAL_RUNTIME_IPC_CHANNELS.has(channel)) {
      requireLocalRuntime();
    }
    return handler(event, ...(args as TArguments));
  });
};

const LOCAL_RUNTIME_IPC_CHANNELS = new Set<string>([
  DESKTOP_IPC_CHANNELS.cacheGetPath,
  DESKTOP_IPC_CHANNELS.cacheWriteAsset,
  DESKTOP_IPC_CHANNELS.draftsDelete,
  DESKTOP_IPC_CHANNELS.draftsGet,
  DESKTOP_IPC_CHANNELS.draftsList,
  DESKTOP_IPC_CHANNELS.draftsSave,
  DESKTOP_IPC_CHANNELS.filesGetAssetUrl,
  DESKTOP_IPC_CHANNELS.filesImportAssets,
  DESKTOP_IPC_CHANNELS.filesListAssets,
  DESKTOP_IPC_CHANNELS.filesRead,
  DESKTOP_IPC_CHANNELS.filesRevealAsset,
  DESKTOP_IPC_CHANNELS.filesWrite,
  DESKTOP_IPC_CHANNELS.generationCancelAssetGeneration,
  DESKTOP_IPC_CHANNELS.generationClearProviderConfig,
  DESKTOP_IPC_CHANNELS.generationEnqueueAssetGeneration,
  DESKTOP_IPC_CHANNELS.generationGenerateWorkflow,
  DESKTOP_IPC_CHANNELS.generationGetGenerationJob,
  DESKTOP_IPC_CHANNELS.generationGetProviderConfig,
  DESKTOP_IPC_CHANNELS.generationListGenerationJobs,
  DESKTOP_IPC_CHANNELS.generationSaveProviderConfig,
  DESKTOP_IPC_CHANNELS.generationTestProviderConfig,
  DESKTOP_IPC_CHANNELS.openFileDialog,
  DESKTOP_IPC_CHANNELS.syncAckOps,
  DESKTOP_IPC_CHANNELS.syncApplyBrandManifest,
  DESKTOP_IPC_CHANNELS.syncGetCursor,
  DESKTOP_IPC_CHANNELS.syncGetJobs,
  DESKTOP_IPC_CHANNELS.syncGetOps,
  DESKTOP_IPC_CHANNELS.syncGetState,
  DESKTOP_IPC_CHANNELS.syncQueueOp,
  DESKTOP_IPC_CHANNELS.syncRecordAssetSync,
  DESKTOP_IPC_CHANNELS.syncSetCursor,
  DESKTOP_IPC_CHANNELS.syncTriggerThreads,
  DESKTOP_IPC_CHANNELS.terminalCreate,
  DESKTOP_IPC_CHANNELS.terminalKill,
  DESKTOP_IPC_CHANNELS.terminalResize,
  DESKTOP_IPC_CHANNELS.terminalWrite,
  DESKTOP_IPC_CHANNELS.workspaceLinkCloudContext,
  DESKTOP_IPC_CHANNELS.workspaceLinkProject,
  DESKTOP_IPC_CHANNELS.workspaceOpen,
  DESKTOP_IPC_CHANNELS.workspaceRead,
  DESKTOP_IPC_CHANNELS.workspaceRecent,
  DESKTOP_IPC_CHANNELS.workspaceReveal,
  DESKTOP_IPC_CHANNELS.workspaceSelect,
]);

const waitForCanonicalAppReady = async (
  window: BrowserWindow,
  timeoutMs = 15_000,
): Promise<void> => {
  await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const deadline = Date.now() + ${String(timeoutMs)};
      const check = () => {
        const appReady = document.readyState === 'complete' && Boolean(document.body);
        const bridgeReady = typeof window.genfeedDesktop?.auth?.login === 'function';
        if (appReady && bridgeReady) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error('Timed out waiting for the hosted app and desktop bridge.'));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  `);
};

const loadCanonicalApp = async (
  window: BrowserWindow,
  targetUrl: string,
): Promise<void> => {
  const didFinishLoad = new Promise<void>((resolve, reject) => {
    const handleFinished = (): void => {
      window.webContents.off('did-fail-load', handleFailed);
      resolve();
    };
    const handleFailed = (
      _event: unknown,
      errorCode: number,
      errorDescription: string,
    ): void => {
      window.webContents.off('did-finish-load', handleFinished);
      reject(
        new Error(
          `Canonical app failed to load (${String(errorCode)}): ${errorDescription}`,
        ),
      );
    };

    window.webContents.once('did-fail-load', handleFailed);
    window.webContents.once('did-finish-load', handleFinished);
  });

  await Promise.all([window.loadURL(targetUrl), didFinishLoad]);
  await waitForCanonicalAppReady(window);
};

const configureSessionPermissions = (): void => {
  const isAllowedPermission = (
    permission: string,
    requestingOrigin: string,
  ): boolean =>
    ALLOWED_PERMISSIONS.has(permission) && isShellOrigin(requestingOrigin);

  // The product only needs notification delivery and sanitized clipboard writes.
  // Camera, microphone, geolocation, MIDI, USB, and all other grants stay denied.
  electronSession.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      callback(isAllowedPermission(permission, details.requestingUrl));
    },
  );
  electronSession.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      isAllowedPermission(permission, requestingOrigin),
  );
};

const attachMainWindowLifecycle = (window: BrowserWindow): void => {
  window.on('close', (event) => {
    handleDesktopWindowClose(windowClosePolicy, event, {
      hide: () => {
        mainWindow?.hide();
      },
      isQuitting: () => isQuitting,
    });
  });

  window.on('closed', () => {
    handleDesktopWindowClosed(windowClosePolicy, {
      isQuitting: () => isQuitting,
      onClosed: () => {
        mainWindow = null;
      },
      quit: () => {
        app.exit(1);
      },
    });
  });
};

const createWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    backgroundColor: getDesktopBootBackground(
      nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
    ),
    height: 980,
    minHeight: 780,
    minWidth: 1280,
    show: false,
    title: 'GenFeed',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      additionalArguments: [
        `--genfeed-app-origin=${appShellService.appOrigin}`,
      ],
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(mainDir, 'preload.cjs'),
      sandbox: true,
    },
    width: 1560,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const isDev = !app.isPackaged;

  const guardNavigation = (
    event: { preventDefault(): void },
    targetUrl: string,
  ): void => {
    if (isShellOrigin(targetUrl)) {
      return;
    }

    event.preventDefault();
    openAllowedExternalUrl(targetUrl);
  };

  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openAllowedExternalUrl(url);
    return { action: 'deny' };
  });

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
    if (isSmokeTest) {
      process.stderr.write(
        `[desktop] smoke readiness failed: renderer exited (${details.reason}).\n`,
      );
      app.exit(1);
    }
  });

  attachMainWindowLifecycle(mainWindow);

  appShellService.registerAuthHeaders(mainWindow);

  try {
    await mainWindow.loadURL(buildDesktopLoadingScreenUrl());
    const initialUrl = isOfflineMode
      ? new URL('/desktop/local', appShellService.appOrigin).toString()
      : appShellService.buildInitialUrl(sessionService.getSession());
    await loadCanonicalApp(mainWindow, initialUrl);

    if (isDev && !isSmokeTest) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    if (isSmokeTest) {
      const unexpectedDatabasePath = path.join(
        app.getPath('userData'),
        'pglite-db',
      );
      if (fs.existsSync(unexpectedDatabasePath)) {
        throw new Error(
          `Cloud startup created an unexpected local database at ${unexpectedDatabasePath}`,
        );
      }
      process.stdout.write(
        '[desktop] smoke readiness confirmed: canonical shell rendered without PGlite.\n',
      );
      app.exit(0);
      return;
    }
  } catch (error) {
    process.stderr.write(
      `[desktop] app shell boot failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );

    telemetryService.captureException(error, {
      surface: 'app-shell',
    });
    logService?.error(
      `app shell boot failed: ${error instanceof Error ? error.stack || error.message : String(error)}`,
    );

    if (isSmokeTest) {
      app.exit(1);
      return;
    }

    await mainWindow.loadURL(buildDesktopFailureScreenUrl());
  }

  buildDesktopMenu(mainWindow, () => {
    void (async () => {
      await activateDesktopLocalMode(
        initializeLocalRuntime,
        () => {
          desktopStore.setValueSync(OFFLINE_MODE_KEY, 'local');
        },
        undefined,
        invalidateLocalRuntimeAttempt,
      );
      const workspace = await openAndActivateWorkspace();
      if (!workspace) return;
      await emitBootstrap();
      if (mainWindow) {
        await loadCanonicalApp(
          mainWindow,
          new URL('/desktop/local', appShellService.appOrigin).toString(),
        );
      }
    })().catch((error) => {
      logService?.error(
        `open local workspace failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  });
};

const showDesktopStartupFailure = async (error: unknown): Promise<void> => {
  const errorText =
    error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`[desktop] startup failed: ${errorText}\n`);
  logService?.error(`startup failed: ${errorText}`);
  telemetryService.captureException(error, { surface: 'startup' });
  windowClosePolicy = DESKTOP_WINDOW_CLOSE_POLICY.QUIT_ON_CLOSE;

  if (isSmokeTest) {
    app.exit(1);
    return;
  }

  try {
    if (!mainWindow) {
      mainWindow = new BrowserWindow({
        backgroundColor: getDesktopBootBackground(
          nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
        ),
        height: 720,
        minHeight: 560,
        minWidth: 860,
        show: false,
        title: 'GenFeed',
        titleBarStyle:
          process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
        width: 1080,
      });

      attachMainWindowLifecycle(mainWindow);
    }

    await mainWindow.loadURL(buildDesktopFailureScreenUrl());
    mainWindow.show();
    mainWindow.focus();
  } catch (failureScreenError) {
    process.stderr.write(
      `[desktop] failure screen could not open: ${failureScreenError instanceof Error ? failureScreenError.stack || failureScreenError.message : String(failureScreenError)}\n`,
    );
    app.exit(1);
  }
};

const openAndActivateWorkspace = async () => {
  requireLocalRuntime();
  if (!workspaceService || !kvService) {
    throw new Error('Local workspace services are unavailable.');
  }

  const workspace = await requireLocalService(workspaceService).openWorkspace();

  if (workspace) {
    await requireLocalService(kvService).setValue(
      ACTIVE_WORKSPACE_ID_KEY,
      workspace.id,
    );
  }

  return workspace;
};

const waitForVisualQaPaint = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
};

const captureVisualQaScreenshot = async (
  outputDirectory: string,
  filename: string,
  expectedState: string,
  predicate: string,
): Promise<void> => {
  if (!mainWindow) {
    throw new Error('Desktop visual QA window is unavailable.');
  }

  await waitForVisualQaPaint();
  const hasExpectedState =
    await mainWindow.webContents.executeJavaScript(predicate);
  if (!hasExpectedState) {
    throw new Error(
      `Desktop visual QA state "${expectedState}" was not visible for ${filename}.`,
    );
  }
  const image = await mainWindow.webContents.capturePage();
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, filename), image.toPNG());
};

const loadVisualQaRoute = async (pathname: string): Promise<void> => {
  if (!mainWindow) {
    throw new Error('Desktop visual QA window is unavailable.');
  }

  await loadCanonicalApp(
    mainWindow,
    new URL(pathname, appShellService.appOrigin).toString(),
  );
};

const isVisualQaSession = (value: unknown): value is IDesktopSession => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const sessionCookie = candidate.sessionCookie;

  if (typeof sessionCookie !== 'object' || sessionCookie === null) {
    return false;
  }

  const cookie = sessionCookie as Record<string, unknown>;

  return (
    typeof candidate.issuedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.issuedAt)) &&
    typeof candidate.token === 'string' &&
    candidate.token.startsWith('gf_') &&
    (candidate.userEmail === undefined ||
      typeof candidate.userEmail === 'string') &&
    typeof candidate.userId === 'string' &&
    (candidate.userName === undefined ||
      typeof candidate.userName === 'string') &&
    (cookie.cookieName === 'better-auth.session_token' ||
      cookie.cookieName === '__Secure-better-auth.session_token') &&
    typeof cookie.cookieValue === 'string' &&
    cookie.cookieValue.length > 0 &&
    typeof cookie.expiresAt === 'string' &&
    Number.isFinite(Date.parse(cookie.expiresAt)) &&
    typeof cookie.httpOnly === 'boolean' &&
    cookie.path === '/' &&
    (cookie.sameSite === 'lax' ||
      cookie.sameSite === 'none' ||
      cookie.sameSite === 'strict') &&
    typeof cookie.secure === 'boolean'
  );
};

const getVisualQaSession = (): IDesktopSession => {
  const rawSession = process.env.GENFEED_DESKTOP_VISUAL_QA_SESSION;

  if (!rawSession) {
    throw new Error(
      'GENFEED_DESKTOP_VISUAL_QA_SESSION is required for authenticated visual QA states.',
    );
  }

  const session = JSON.parse(rawSession) as unknown;

  if (!isVisualQaSession(session)) {
    throw new Error('GENFEED_DESKTOP_VISUAL_QA_SESSION is invalid.');
  }

  return session;
};

const captureVisualQa = async (): Promise<void> => {
  const outputDirectory = process.env.GENFEED_DESKTOP_VISUAL_QA_DIR;
  if (!outputDirectory || !mainWindow) {
    throw new Error('GENFEED_DESKTOP_VISUAL_QA_DIR is required.');
  }

  await sessionService.clearSession();
  await loadVisualQaRoute('/login');
  await captureVisualQaScreenshot(
    outputDirectory,
    'desktop-login.png',
    'desktop login surface',
    `document.body?.innerText.includes('Sign in to Genfeed') === true`,
  );

  const visualQaSession = getVisualQaSession();
  await sessionService.setSession(visualQaSession);
  await localIdentityService?.setBetterAuthId(visualQaSession.userId);
  await persistDeviceIdentity(visualQaSession);
  await emitSession();
  await loadVisualQaRoute('/');
  await captureVisualQaScreenshot(
    outputDirectory,
    'pkce-callback.png',
    'post-PKCE authenticated root',
    `location.pathname !== '/login' && document.body?.classList.contains('gf-desktop-shell') === true`,
  );

  await loadVisualQaRoute(
    process.env.GENFEED_DESKTOP_VISUAL_QA_AUTHENTICATED_ROUTE || '/home',
  );
  await captureVisualQaScreenshot(
    outputDirectory,
    'authenticated-route.png',
    'protected canonical route',
    `location.pathname !== '/login' && document.body?.classList.contains('gf-desktop-shell') === true`,
  );

  await sessionService.clearSession();
  await emitSession();
  await loadVisualQaRoute('/login');
  await captureVisualQaScreenshot(
    outputDirectory,
    'logout.png',
    'login surface after sign-out',
    `document.body?.innerText.includes('Sign in to Genfeed') === true`,
  );

  await sessionService.setSession(visualQaSession);
  sessionService = new DesktopSessionService(
    desktopStore,
    environment,
    appShellService.appOrigin,
    electronSession.defaultSession.cookies,
  );
  const restoredSession = await sessionService.validateStoredSession();
  if (!restoredSession) {
    throw new Error(
      'Desktop visual QA could not restore the persisted session.',
    );
  }
  await emitSession();
  await loadVisualQaRoute('/home');
  await captureVisualQaScreenshot(
    outputDirectory,
    'restart-persistence.png',
    'protected route restored after restart',
    `location.pathname !== '/login' && document.body?.classList.contains('gf-desktop-shell') === true`,
  );

  await sessionService.setSession({
    ...restoredSession,
    sessionCookie: {
      ...restoredSession.sessionCookie,
      expiresAt: new Date(Date.now() + 250).toISOString(),
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  await sessionService.validateStoredSession();
  await emitSession();
  await loadVisualQaRoute('/login');
  await captureVisualQaScreenshot(
    outputDirectory,
    'expired-credential-recovery.png',
    'login surface after credential expiry',
    `document.body?.innerText.includes('Sign in to Genfeed') === true`,
  );
};

const handleAuthCallback = async (
  rawUrl: string,
): Promise<DesktopAuthCallbackResult> => {
  const result = await sessionService.handleCallback(rawUrl);

  if (!result.isOk) {
    telemetryService.captureException(new Error(result.error.message), {
      code: result.error.code,
      surface: 'auth-callback',
    });
    await emitSession();
    await emitBootstrap();
    if (Notification.isSupported()) {
      void new Notification({
        body: result.error.message,
        title: 'Desktop authentication failed',
      }).show();
    }
    return result;
  }

  const { session } = result;
  await localIdentityService?.setBetterAuthId(session.userId);
  await persistDeviceIdentity(session);
  await emitSession();
  await emitBootstrap();
  if (mainWindow) {
    await loadCanonicalApp(
      mainWindow,
      appShellService.buildInitialUrl(session),
    );
  }
  void new Notification({
    body: session.userEmail || 'Authenticated successfully.',
    title: 'GenFeed',
  }).show();
  return result;
};

const registerProtocolHandling = (): void => {
  app.setAsDefaultProtocolClient('genfeedai-desktop');

  app.on('open-url', (event: { preventDefault(): void }, url: string) => {
    event.preventDefault();
    void handleAuthCallback(url);
  });
};

const registerIpcHandlers = (): void => {
  // The canonical apps/app shell is always available. Database-backed channels
  // are guarded by LOCAL_RUNTIME_IPC_CHANNELS and cannot initialize PGlite as a
  // side effect; appEnableOfflineMode is the single explicit activation path.
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.appBootstrap, async () =>
    getBootstrap(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appDetectLocalTools,
    async () => detectDesktopLocalTools(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appEnableOfflineMode,
    async () => {
      await activateDesktopLocalMode(
        initializeLocalRuntime,
        () => {
          desktopStore.setValueSync(OFFLINE_MODE_KEY, 'local');
        },
        undefined,
        invalidateLocalRuntimeAttempt,
      );
      await emitBootstrap();
      return getBootstrap();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appUseCloudMode,
    async () => {
      await switchDesktopToCloud({
        closeLocalRuntime: async () => {
          await prismaService?.getClient().$disconnect();
          await pgliteService?.close();
        },
        exit: () => app.exit(0),
        persistCloudMode: () => {
          desktopStore.setValueSync(OFFLINE_MODE_KEY, 'cloud');
          isOfflineMode = false;
        },
        relaunch: () => app.relaunch(),
      });
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appGetDiagnostics,
    async () => ({
      isPackaged: app.isPackaged,
      logPath: logService?.getPath() ?? '',
      mode: isOfflineMode ? 'local' : 'cloud',
      platform: process.platform,
      releaseChannel: app.isPackaged ? 'production' : 'development',
      version: app.getVersion(),
    }),
  );
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.appRevealLogs, async () => {
    const logPath = logService?.getPath();
    if (!logPath) throw new Error('Desktop logs are unavailable.');
    shell.showItemInFolder(logPath);
  });
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appOpenExternalPath,
    async (_event: unknown, pathname: string) => {
      await openValidatedExternalUrl(
        buildExternalAppUrl(pathname, environment.authEndpoint),
      );
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.authGetSession,
    async () => null,
  );
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.authLogin, async () => {
    await openValidatedExternalUrl(sessionService.getLoginUrl());
  });
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.authCompleteWithCode,
    async (_event: unknown, raw: unknown) => {
      if (typeof raw !== 'string') {
        throw new Error('Paste the sign-in code from the browser.');
      }

      const callbackUrl = sessionService.buildCallbackUrlFromPaste(raw);

      if (!callbackUrl) {
        throw new Error(
          'Sign-in expired. Click Sign in with Genfeed, then paste the new code from that browser tab.',
        );
      }

      const result = await handleAuthCallback(callbackUrl);

      if (!result.isOk) {
        throw new Error(result.error.message);
      }
    },
  );
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.authLogout, async () => {
    await sessionService.clearSession();
    await persistDeviceIdentity(null);
    await emitSession();
    await emitBootstrap();
    if (mainWindow) {
      await loadCanonicalApp(
        mainWindow,
        new URL('/login', appShellService.appOrigin).toString(),
      );
    }
  });
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudListProjects,
    async () => runDataService((service) => service.listProjects()),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudGenerateHooks,
    async (_event: unknown, topic: string) =>
      runDataService((service) => service.generateHooks(topic)),
  );
  registerPrivilegedIpcHandler(
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
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudGetTrends,
    async (_event: unknown, platform: string) =>
      runDataService((service) => service.getTrends(platform)),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudGetIngredients,
    async (_event: unknown, filter?: { limit?: number; platform?: string }) =>
      runDataService((service) => service.getIngredients(filter)),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudPublishPost,
    async (
      _event: unknown,
      params: { content: string; draftId?: string; platform: string },
    ) => runDataService((service) => service.publishPost(params)),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudGetAnalytics,
    async (_event: unknown, params: { days: number }) =>
      runDataService((service) => service.getAnalytics(params)),
  );
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.cloudListAgents, async () =>
    runDataService((service) => service.listAgents()),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudRunAgent,
    async (_event: unknown, agentId: string) =>
      runDataService((service) => service.runAgent(agentId)),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudListWorkflows,
    async () => runDataService((service) => service.listWorkflows()),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudRunWorkflow,
    async (_event: unknown, params: { batch?: boolean; workflowId: string }) =>
      runDataService((service) => service.runWorkflow(params)),
  );
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.workspaceOpen, async () => {
    const workspace = await openAndActivateWorkspace();
    await emitBootstrap();
    return workspace;
  });
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.workspaceRecent, async () =>
    requireLocalService(workspaceService).listRecentWorkspaces(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceRead,
    async (_event: unknown, workspaceId: string) =>
      requireLocalService(workspaceService).getWorkspace(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceLinkProject,
    async (_event: unknown, workspaceId: string, projectId: string) => {
      const workspace = await requireLocalService(workspaceService).linkProject(
        workspaceId,
        projectId || null,
        getLocalCloudIdentityContext(),
      );
      await emitBootstrap();
      return workspace;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceLinkCloudContext,
    async (
      _event: unknown,
      workspaceId: string,
      input: IDesktopWorkspaceCloudLinkInput,
    ) => {
      const workspace = await requireLocalService(
        workspaceService,
      ).linkCloudContext(workspaceId, input, getLocalCloudIdentityContext());
      await emitBootstrap();
      return workspace;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceReveal,
    async (_event: unknown, workspaceId: string) => {
      await requireLocalService(workspaceService).revealInFinder(workspaceId);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceSelect,
    async (_event: unknown, workspaceId: string) => {
      await setActiveWorkspaceId(workspaceId);
      await emitBootstrap();
      return requireLocalService(workspaceService).getWorkspace(workspaceId);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.draftsList,
    async (_event: unknown, workspaceId: string) =>
      requireLocalService(draftsService).listDrafts(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.draftsGet,
    async (_event: unknown, workspaceId: string, draftId: string) =>
      requireLocalService(draftsService).getDraft(workspaceId, draftId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.draftsSave,
    async (
      _event: unknown,
      workspaceId: string,
      draft: IDesktopContentRunDraft,
    ) => requireLocalService(draftsService).saveDraft(workspaceId, draft),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.draftsDelete,
    async (_event: unknown, workspaceId: string, draftId: string) => {
      await requireLocalService(draftsService).deleteDraft(
        workspaceId,
        draftId,
      );
      await emitBootstrap();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesRead,
    async (_event: unknown, workspaceId: string, relativePath: string) =>
      requireLocalService(filesService).readFile(workspaceId, relativePath),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesWrite,
    async (
      _event: unknown,
      workspaceId: string,
      relativePath: string,
      contents: string,
    ) => {
      await requireLocalService(filesService).writeFile(
        workspaceId,
        relativePath,
        contents,
      );
      await emitBootstrap();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesImportAssets,
    async (_event: unknown, workspaceId: string, filePaths?: string[]) => {
      const importedAssets = await requireLocalService(
        filesService,
      ).importAssets(workspaceId, filePaths);
      await emitBootstrap();
      return importedAssets;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesListAssets,
    async (_event: unknown, workspaceId?: string) =>
      requireLocalService(filesService).listAssets(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesGetAssetUrl,
    async (_event: unknown, assetId: string) =>
      requireLocalService(filesService).getAssetUrl(assetId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesRevealAsset,
    async (_event: unknown, assetId: string) => {
      await requireLocalService(filesService).revealAsset(assetId);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationEnqueueAssetGeneration,
    async (_event: unknown, request: IDesktopAssetGenerationRequest) => {
      const job =
        await requireLocalService(generationService).enqueueAssetGeneration(
          request,
        );
      await emitBootstrap();
      return job;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationGetGenerationJob,
    async (_event: unknown, jobId: string) =>
      requireLocalService(generationService).getGenerationJob(jobId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationListGenerationJobs,
    async (_event: unknown, workspaceId?: string) =>
      requireLocalService(generationService).listGenerationJobs(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationCancelAssetGeneration,
    async (_event: unknown, jobId: string) => {
      const job =
        await requireLocalService(generationService).cancelGenerationJob(jobId);
      await emitBootstrap();
      return job;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationGetProviderConfig,
    async () =>
      requireLocalService(generationService).getPublicProviderConfig(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationGenerateWorkflow,
    async (_event: unknown, params: IDesktopWorkflowGenerationOptions) =>
      requireLocalService(generationService).generateWorkflow(params),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationSaveProviderConfig,
    async (_event: unknown, config: IDesktopGenerationProviderConfig) =>
      requireLocalService(generationService).saveProviderConfig(config),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationClearProviderConfig,
    async () => {
      await requireLocalService(generationService).clearProviderConfig();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationTestProviderConfig,
    async (_event: unknown, config?: IDesktopGenerationProviderConfig) =>
      requireLocalService(generationService).testProviderConfig(config),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.notify,
    async (_event: unknown, title: string, body: string) => {
      if (Notification.isSupported()) {
        void new Notification({ body, title }).show();
      }
    },
  );
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.cacheGetPath, async () => {
    const cachePath = path.join(app.getPath('userData'), 'cache');
    fs.mkdirSync(cachePath, { recursive: true });
    return cachePath;
  });
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cacheWriteAsset,
    async (_event: unknown, filename: string, data: ArrayBuffer) => {
      const cachePath = path.join(app.getPath('userData'), 'cache');
      fs.mkdirSync(cachePath, { recursive: true });
      const filePath = path.join(cachePath, filename);
      fs.writeFileSync(filePath, Buffer.from(data));
      return filePath;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.openFileDialog,
    async () => {
      if (!mainWindow) {
        return { canceled: true, filePaths: [] };
      }
      return dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
      });
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncAckOps,
    async (_event: unknown, cloudUserId: string, ops: IDesktopSyncOpAck[]) => {
      assertActiveSyncAccount(sessionService.getSession(), cloudUserId);
      await requireLocalService(syncService).ackOps(ops);
      await emitBootstrap();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncApplyBrandManifest,
    async (
      _event: unknown,
      cloudUserId: string,
      manifest: IDesktopBrandManifest,
    ) => {
      assertActiveSyncAccount(sessionService.getSession(), cloudUserId);
      await requireLocalService(syncService).applyBrandManifest(manifest);
      await emitBootstrap();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncGetJobs,
    async (_event: unknown, workspaceId?: string) =>
      requireLocalService(syncService).listJobs(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncGetOps,
    async (_event: unknown, workspaceId?: string) =>
      requireLocalService(syncService).listOps(workspaceId),
  );
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.syncGetState, async () =>
    requireLocalService(syncService).getState(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncQueueOp,
    async (
      _event: unknown,
      entityType: string,
      entityId: string,
      operation: 'create' | 'delete' | 'update',
      payload: string,
      workspaceId?: string,
      baseVersion?: string,
    ) => {
      const op = await requireLocalService(syncService).queueOp(
        entityType,
        entityId,
        operation,
        payload,
        workspaceId,
        baseVersion,
      );
      await emitBootstrap();
      return op;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncRecordAssetSync,
    async (
      _event: unknown,
      cloudUserId: string,
      update: IDesktopAssetSyncUpdate,
    ) => {
      assertActiveSyncAccount(sessionService.getSession(), cloudUserId);
      await requireLocalService(syncService).recordAssetSync(update);
      await emitBootstrap();
    },
  );

  // Sync cursor (durable storage in main-process KV)
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.syncGetConsent, async () =>
    syncConsentService.getConsent(sessionService.getSession()),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncSetConsent,
    async (
      _event: unknown,
      cloudUserId: string,
      input: IDesktopSyncConsentInput,
    ) => {
      const session = assertActiveSyncAccount(
        sessionService.getSession(),
        cloudUserId,
      );
      const consent = await syncConsentService.setConsent(session, input);
      await emitBootstrap();
      // The canonical app has no renderer-side PGlite sync engine yet.
      return consent;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncGetCursor,
    async (
      _event: unknown,
      cloudUserId: string,
      scope?: DesktopSyncCursorScope,
    ) =>
      requireLocalService(kvService).getValueSync(
        getSyncCursorKey(cloudUserId, scope),
      ),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncSetCursor,
    async (
      _event: unknown,
      cloudUserId: string,
      cursor: string,
      scope?: DesktopSyncCursorScope,
    ) => {
      requireLocalService(kvService).setValueSync(
        getSyncCursorKey(cloudUserId, scope),
        cursor,
      );
    },
  );

  // The deleted renderer owned thread sync; keep the contract recoverable.
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncTriggerThreads,
    async () => ({
      error:
        'Desktop thread sync is unavailable until the Phase-2 adapter lands.',
      ok: false,
    }),
  );

  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.terminalCreate,
    async (event, options?: IDesktopTerminalCreateOptions) =>
      requireLocalService(terminalService).createSession(
        options,
        (payload) => {
          event.sender.send(DESKTOP_IPC_CHANNELS.terminalData, payload);
        },
        (payload) => {
          event.sender.send(DESKTOP_IPC_CHANNELS.terminalExit, payload);
        },
      ),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.terminalWrite,
    async (_event: unknown, sessionId: string, data: string) => {
      requireLocalService(terminalService).writeSession(sessionId, data);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.terminalResize,
    async (_event: unknown, sessionId: string, cols: number, rows: number) => {
      requireLocalService(terminalService).resizeSession(sessionId, cols, rows);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.terminalKill,
    async (_event: unknown, sessionId: string) => {
      requireLocalService(terminalService).killSession(sessionId);
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
      terminalService?.killAll();
      await appShellService?.stop();
    } finally {
      shortcutsService.unregister();
      trayService.destroy();
      await prismaService?.getClient().$disconnect();
      await pgliteService?.close();
      app.quit();
    }
  })();
});

app.on('will-quit', () => {
  if (smokeUserDataDir) {
    fs.rmSync(smokeUserDataDir, { force: true, recursive: true });
  }
});

const handleDesktopProcessException = createDesktopProcessExceptionHandler({
  captureException: (error, context) => {
    telemetryService.captureException(error, context);
  },
  exit: (code) => {
    app.exit(code);
  },
  isAppReady: () => app.isReady(),
  showFailureScreen: showDesktopStartupFailure,
  writeError: (message) => {
    try {
      process.stderr.write(message);
    } catch {
      // Parent bun/next may have closed the pipe; the file log still records it.
    }
    logService?.error(message.trim());
  },
});

process.on(DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION, (error) => {
  handleDesktopProcessException(
    error,
    DESKTOP_PROCESS_EXCEPTION_SOURCE.UNCAUGHT_EXCEPTION,
  );
});
process.on(DESKTOP_PROCESS_EXCEPTION_SOURCE.UNHANDLED_REJECTION, (reason) => {
  handleDesktopProcessException(
    reason,
    DESKTOP_PROCESS_EXCEPTION_SOURCE.UNHANDLED_REJECTION,
  );
});

void app
  .whenReady()
  .then(async () => {
    nativeTheme.themeSource = 'system';
    nativeTheme.on('updated', () => {
      mainWindow?.setBackgroundColor(
        getDesktopBootBackground(
          nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
        ),
      );
    });
    logService = new DesktopLogService(
      path.join(app.getPath('userData'), 'logs', 'main.log'),
    );
    logService.info('desktop startup');
    telemetryService.init();
    desktopStore = new DesktopStoreService(
      path.join(app.getPath('userData'), 'desktop-state.json'),
    );
    syncConsentService = new DesktopSyncConsentService(desktopStore);
    appShellService = new DesktopAppShellService(
      environment,
      () => sessionService.getSession(),
      // Spawned server processes carve their own storage directories out of the
      // Electron data root; using PGlite's directory would nest them under the DB.
      () => app.getPath('userData'),
      (level, message) => logService?.write(level, message),
    );
    await appShellService.start();
    sessionService = new DesktopSessionService(
      desktopStore,
      environment,
      appShellService.appOrigin,
      electronSession.defaultSession.cookies,
    );
    await sessionService.validateStoredSession();
    cloudService = new DesktopCloudService(environment, () =>
      sessionService.getSession(),
    );
    isOfflineMode = await restoreDesktopRuntimeMode({
      initializeLocalRuntime,
      isLocalModeRequested:
        desktopStore.getValueSync(OFFLINE_MODE_KEY) === 'local',
      onLocalRuntimeError: (error) => {
        process.stderr.write(
          `[desktop] local runtime could not start: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
        );
        logService?.error(
          `local runtime could not start: ${error instanceof Error ? error.stack || error.message : String(error)}`,
        );
        telemetryService.captureException(error, { surface: 'local-runtime' });
        applyUnwoundLocalRuntime();
      },
      persistCloudMode: () => {
        desktopStore.setValueSync(OFFLINE_MODE_KEY, 'cloud');
      },
    });
    telemetryService.setUser(sessionService.getSession());
    registerProtocolHandling();
    configureSessionPermissions();
    registerIpcHandlers();
    await createWindow();

    if (isVisualQa) {
      try {
        await captureVisualQa();
        app.exit(0);
      } catch (error) {
        process.stderr.write(
          `[desktop] visual QA capture failed: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
        );
        app.exit(1);
      }
      return;
    }

    if (mainWindow) {
      trayService.initialize(mainWindow, emitQuickGenerate);
      shortcutsService.register(mainWindow, emitQuickGenerate);
    }

    const updaterService = new DesktopUpdaterService({
      autoUpdater,
      isPackaged: app.isPackaged,
      notify: ({ body, title }) => {
        if (Notification.isSupported()) {
          void new Notification({ body, title }).show();
        }
      },
      onError: (error, context) => {
        telemetryService.captureException(error, context);
      },
    });
    updaterService.initialize();

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
  })
  .catch(showDesktopStartupFailure);

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
