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
} from '@genfeedai/desktop-contracts';
import { DESKTOP_IPC_CHANNELS } from '@genfeedai/desktop-contracts';
import {
  app,
  BrowserWindow,
  dialog,
  session as electronSession,
  type IpcMainInvokeEvent,
  ipcMain,
  Notification,
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
import { buildDesktopMenu } from './main/menu.service';
import { DesktopPgliteService } from './main/pglite.service';
import { DesktopPrismaService } from './main/prisma.service';
import {
  DesktopSessionService,
  type IDesktopSession,
} from './main/session.service';
import { DesktopShortcutsService } from './main/shortcuts.service';
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
let kvService: DesktopKvService;
let localIdentityService: LocalIdentityService;
let sessionService: DesktopSessionService;
let workspaceService: DesktopWorkspaceService;
let filesService: DesktopFilesService;
let syncService: DesktopSyncService;
let syncConsentService: DesktopSyncConsentService;
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
const OFFLINE_MODE_KEY = 'desktop.offline.mode';
const ACTIVE_WORKSPACE_ID_KEY = 'desktop.workspace.activeId';

function getSyncCursorKey(
  cloudUserId: string,
  scope: DesktopSyncCursorScope = 'threads',
): string {
  assertActiveSyncAccount(sessionService.getSession(), cloudUserId);
  return getAccountScopedSyncCursorKey(cloudUserId, scope);
}

function getBetterAuthId(): string | null {
  return localIdentityService.getBetterAuthId();
}

function getLocalCloudIdentityContext() {
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
): Promise<void> => {
  const client = prismaService?.getClient();

  if (!client) {
    return;
  }

  const now = new Date().toISOString();
  const localDeviceId = localIdentityService.getLocalDeviceId();
  const betterAuthId = getBetterAuthId();
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
      localUserId: localIdentityService.getLocalUserId(),
      status: getCloudIdentityStatus(session, betterAuthId),
      updatedAt: now,
    },
    update: {
      cloudUserEmail: session?.userEmail ?? existing?.cloudUserEmail ?? null,
      cloudUserId: betterAuthId ?? existing?.cloudUserId ?? null,
      connectedAt: session?.issuedAt ?? existing?.connectedAt ?? null,
      lastSeenAt: now,
      localUserId: localIdentityService.getLocalUserId(),
      status: getCloudIdentityStatus(session, betterAuthId),
      updatedAt: now,
    },
    where: {
      id: localDeviceId,
    },
  });
};

const getActiveWorkspaceId = (
  workspaces = workspaceService.listRecentWorkspaces(),
): string | null => {
  const storedWorkspaceId = kvService.getValueSync(ACTIVE_WORKSPACE_ID_KEY);

  if (
    storedWorkspaceId &&
    workspaces.some((workspace) => workspace.id === storedWorkspaceId)
  ) {
    return storedWorkspaceId;
  }

  return workspaces[0]?.id ?? null;
};

const setActiveWorkspaceId = async (workspaceId: string): Promise<void> => {
  workspaceService.getWorkspace(workspaceId);
  await kvService.setValue(ACTIVE_WORKSPACE_ID_KEY, workspaceId);
};

function getDataService(): IDesktopDataService {
  return sessionService.getSession() ? cloudService : localService;
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

  const workspaces = workspaceService.listRecentWorkspaces();
  const session = sessionService.getSession();
  const betterAuthId = getBetterAuthId();
  const localUserId = localIdentityService.getLocalUserId();
  const bootstrap: IDesktopBootstrap = {
    activeWorkspaceId: getActiveWorkspaceId(workspaces),
    authority: DESKTOP_AUTHORITY,
    betterAuthId,
    cloudIdentity: {
      cloudUserEmail: session?.userEmail,
      cloudUserId: betterAuthId ?? undefined,
      connectedAt: session?.issuedAt,
      localDeviceId: localIdentityService.getLocalDeviceId(),
      localUserId,
      status: getCloudIdentityStatus(session, betterAuthId),
    },
    cloudOrganizations: syncService.listCloudOrganizations(),
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
    brands: syncService.listBrands(),
    recents: workspaceService.listRecents(),
    // Better Auth state is carried by the HttpOnly shell cookie. The API key
    // stays in main for request-header injection and is never serialized here.
    session: null,
    syncConsent: syncConsentService.getConsent(session),
    syncState: syncService.getState(),
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
    return handler(event, ...(args as TArguments));
  });
};

const waitForCanonicalAppReady = async (
  window: BrowserWindow,
  timeoutMs = 15_000,
): Promise<void> => {
  await window.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const deadline = Date.now() + ${String(timeoutMs)};
      const check = () => {
        if (document.body?.classList.contains('gf-desktop-shell')) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error('Timed out waiting for gf-desktop-shell.'));
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
      additionalArguments: [
        `--genfeed-app-origin=${appShellService.appOrigin}`,
      ],
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(mainDir, 'preload.js'),
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
    await loadCanonicalApp(
      mainWindow,
      appShellService.buildInitialUrl(sessionService.getSession()),
    );

    if (isDev && !isSmokeTest) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    if (isSmokeTest) {
      process.stdout.write(
        '[desktop] smoke readiness confirmed: canonical shell marker rendered.\n',
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

    if (isSmokeTest) {
      app.exit(1);
      return;
    }

    await mainWindow.loadURL(buildDesktopFailureScreenUrl());
  }

  buildDesktopMenu(mainWindow, () => {
    void openAndActivateWorkspace().then(async (workspace) => {
      if (!workspace) {
        return;
      }

      await emitBootstrap();
      mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.toggleSidebar);
    });
  });
};

const openAndActivateWorkspace = async () => {
  const workspace = await workspaceService.openWorkspace();

  if (workspace) {
    await kvService.setValue(ACTIVE_WORKSPACE_ID_KEY, workspace.id);
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
  await localIdentityService.setBetterAuthId(visualQaSession.userId);
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
    kvService,
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

const handleAuthCallback = async (rawUrl: string): Promise<void> => {
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
    return;
  }

  const { session } = result;
  await localIdentityService.setBetterAuthId(session.userId);
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
};

const registerProtocolHandling = (): void => {
  app.setAsDefaultProtocolClient('genfeedai-desktop');

  app.on('open-url', (event: { preventDefault(): void }, url: string) => {
    event.preventDefault();
    void handleAuthCallback(url);
  });
};

const registerIpcHandlers = (): void => {
  // Canonical apps/app consumers:
  // Active — auth.login; cloud.generateContent; generation.getProviderConfig,
  // generation.saveProviderConfig, generation.testProviderConfig.
  // Dormant Phase-2 backends — app.*, auth.getSession/logout/onDidChangeSession,
  // cache.*, all other cloud.*, drafts.*, files.*, all other generation.*,
  // notifications.notify, onQuickGenerate, platform, sync.* except triggerThreads,
  // terminal.*, and workspace.*. Their services and bridge contracts stay intact.
  // Removed renderer-owned behavior — getPlatform's unused IPC handler and
  // sync.triggerThreads dispatch/onSyncThreadsRequested delivery. The trigger
  // contract remains callable but reports unavailable instead of false success.
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.appBootstrap, async () =>
    getBootstrap(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appEnableOfflineMode,
    async () => {
      isOfflineMode = true;
      kvService.setValueSync(OFFLINE_MODE_KEY, '1');
      await emitBootstrap();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appGetDiagnostics,
    async () => ({
      isPackaged: app.isPackaged,
      platform: process.platform,
      releaseChannel: app.isPackaged ? 'production' : 'development',
      version: app.getVersion(),
    }),
  );
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
    workspaceService.listRecentWorkspaces(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceRead,
    async (_event: unknown, workspaceId: string) =>
      workspaceService.getWorkspace(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceLinkProject,
    async (_event: unknown, workspaceId: string, projectId: string) => {
      const workspace = await workspaceService.linkProject(
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
      const workspace = await workspaceService.linkCloudContext(
        workspaceId,
        input,
        getLocalCloudIdentityContext(),
      );
      await emitBootstrap();
      return workspace;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceReveal,
    async (_event: unknown, workspaceId: string) => {
      await workspaceService.revealInFinder(workspaceId);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceSelect,
    async (_event: unknown, workspaceId: string) => {
      await setActiveWorkspaceId(workspaceId);
      await emitBootstrap();
      return workspaceService.getWorkspace(workspaceId);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.draftsList,
    async (_event: unknown, workspaceId: string) =>
      draftsService.listDrafts(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.draftsGet,
    async (_event: unknown, workspaceId: string, draftId: string) =>
      draftsService.getDraft(workspaceId, draftId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.draftsSave,
    async (
      _event: unknown,
      workspaceId: string,
      draft: IDesktopContentRunDraft,
    ) => draftsService.saveDraft(workspaceId, draft),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.draftsDelete,
    async (_event: unknown, workspaceId: string, draftId: string) => {
      await draftsService.deleteDraft(workspaceId, draftId);
      await emitBootstrap();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesRead,
    async (_event: unknown, workspaceId: string, relativePath: string) =>
      filesService.readFile(workspaceId, relativePath),
  );
  registerPrivilegedIpcHandler(
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
  registerPrivilegedIpcHandler(
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
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesListAssets,
    async (_event: unknown, workspaceId?: string) =>
      filesService.listAssets(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesGetAssetUrl,
    async (_event: unknown, assetId: string) =>
      filesService.getAssetUrl(assetId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.filesRevealAsset,
    async (_event: unknown, assetId: string) => {
      await filesService.revealAsset(assetId);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationEnqueueAssetGeneration,
    async (_event: unknown, request: IDesktopAssetGenerationRequest) => {
      const job = await generationService.enqueueAssetGeneration(request);
      await emitBootstrap();
      return job;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationGetGenerationJob,
    async (_event: unknown, jobId: string) =>
      generationService.getGenerationJob(jobId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationListGenerationJobs,
    async (_event: unknown, workspaceId?: string) =>
      generationService.listGenerationJobs(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationCancelAssetGeneration,
    async (_event: unknown, jobId: string) => {
      const job = await generationService.cancelGenerationJob(jobId);
      await emitBootstrap();
      return job;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationGetProviderConfig,
    async () => generationService.getPublicProviderConfig(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationGenerateWorkflow,
    async (_event: unknown, params: IDesktopWorkflowGenerationOptions) =>
      generationService.generateWorkflow(params),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationSaveProviderConfig,
    async (_event: unknown, config: IDesktopGenerationProviderConfig) =>
      generationService.saveProviderConfig(config),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationClearProviderConfig,
    async () => {
      await generationService.clearProviderConfig();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.generationTestProviderConfig,
    async (_event: unknown, config?: IDesktopGenerationProviderConfig) =>
      generationService.testProviderConfig(config),
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
      await syncService.ackOps(ops);
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
      await syncService.applyBrandManifest(manifest);
      await emitBootstrap();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncGetJobs,
    async (_event: unknown, workspaceId?: string) =>
      syncService.listJobs(workspaceId),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncGetOps,
    async (_event: unknown, workspaceId?: string) =>
      syncService.listOps(workspaceId),
  );
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.syncGetState, async () =>
    syncService.getState(),
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
      const op = await syncService.queueOp(
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
      await syncService.recordAssetSync(update);
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
    ) => kvService.getValueSync(getSyncCursorKey(cloudUserId, scope)),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.syncSetCursor,
    async (
      _event: unknown,
      cloudUserId: string,
      cursor: string,
      scope?: DesktopSyncCursorScope,
    ) => {
      kvService.setValueSync(getSyncCursorKey(cloudUserId, scope), cursor);
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
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.terminalWrite,
    async (_event: unknown, sessionId: string, data: string) => {
      terminalService.writeSession(sessionId, data);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.terminalResize,
    async (_event: unknown, sessionId: string, cols: number, rows: number) => {
      terminalService.resizeSession(sessionId, cols, rows);
    },
  );
  registerPrivilegedIpcHandler(
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

app.whenReady().then(async () => {
  telemetryService.init();
  pgliteService = new DesktopPgliteService(
    path.join(app.getPath('userData'), 'pglite-db'),
  );
  const pglite = await pgliteService.init();
  prismaService = new DesktopPrismaService(pglite);
  const prismaClient = prismaService.getClient();
  kvService = new DesktopKvService(prismaClient);
  await kvService.init();
  syncConsentService = new DesktopSyncConsentService(kvService);
  localIdentityService = new LocalIdentityService(kvService);
  await localIdentityService.initialize();
  await prismaService.bootstrapLocalIdentity(
    localIdentityService.getLocalUserId(),
  );
  appShellService = new DesktopAppShellService(
    environment,
    () => sessionService.getSession(),
    // Spawned server processes carve their own storage directories out of the
    // Electron data root; using PGlite's directory would nest them under the DB.
    () => app.getPath('userData'),
  );
  await appShellService.start();
  sessionService = new DesktopSessionService(
    kvService,
    environment,
    appShellService.appOrigin,
    electronSession.defaultSession.cookies,
  );
  const session = await sessionService.validateStoredSession();
  if (session) {
    await localIdentityService.setBetterAuthId(session.userId);
  }
  await persistDeviceIdentity(session);
  workspaceService = new DesktopWorkspaceService(prismaClient);
  await workspaceService.init();
  syncService = new DesktopSyncService(prismaClient);
  await syncService.init();
  filesService = new DesktopFilesService(workspaceService, prismaClient);
  new DesktopAssetProtocolService(filesService).register();
  terminalService = new DesktopTerminalService(workspaceService);
  generationService = new DesktopGenerationService(
    {
      deleteValue: (key) => kvService.deleteValue(key),
      getSyncJob: async (jobId) => {
        const row = await prismaClient.desktopSyncJob.findUnique({
          where: { id: jobId },
        });
        return row;
      },
      getValue: (key) => kvService.getValue(key),
      listSyncJobs: async (type, workspaceId) => {
        const rows = await prismaClient.desktopSyncJob.findMany({
          orderBy: {
            updatedAt: 'desc',
          },
          where: {
            type,
            ...(workspaceId ? { workspaceId } : {}),
          },
        });
        return rows;
      },
      setValue: (key, value) => kvService.setValue(key, value),
      upsertSyncJob: async (row) => {
        await prismaClient.desktopSyncJob.upsert({
          create: row,
          update: row,
          where: { id: row.id },
        });
      },
    },
    filesService,
  );
  await generationService.resumeAssetGenerationJobs();
  cloudService = new DesktopCloudService(environment, () =>
    sessionService.getSession(),
  );
  localService = new DesktopLocalService(prismaClient, generationService);
  draftsService = new DesktopDraftsService(workspaceService);
  isOfflineMode = kvService.getValueSync(OFFLINE_MODE_KEY) === '1';
  telemetryService.setUser(sessionService.getSession());
  process.on('uncaughtException', (error) => {
    telemetryService.captureException(error, { source: 'uncaughtException' });
  });
  process.on('unhandledRejection', (error) => {
    telemetryService.captureException(error, { source: 'unhandledRejection' });
  });
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
