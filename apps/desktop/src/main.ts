import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import type {
  IDesktopBootstrap,
  IDesktopDataResult,
  IDesktopDataService,
  IDesktopGenerationOptions,
  IDesktopRuntimeContext,
  IDesktopSelfHostedServerConfig,
  IDesktopServerSelection,
  IDesktopTerminalCreateOptions,
  IDesktopWindowChromeState,
  IDesktopWorkspaceState,
} from '@genfeedai/contracts/desktop';
import {
  DESKTOP_APP_PROTOCOL_SCHEME,
  DESKTOP_IPC_CHANNELS,
  parseDesktopThreadLink,
} from '@genfeedai/contracts/desktop';
import {
  app,
  BrowserWindow,
  dialog,
  session as electronSession,
  type IpcMainInvokeEvent,
  ipcMain,
  Notification,
  nativeTheme,
  safeStorage,
  shell,
} from 'electron';
import electronUpdater from 'electron-updater';
import { DesktopAppShellService } from './main/app-shell.service';
import {
  buildDesktopFailureScreenUrl,
  buildDesktopLoadingScreenUrl,
  getDesktopBootBackground,
} from './main/boot-screen';
import { DesktopCliAgentRuntimeService } from './main/cli-agent-runtime.service';
import { DesktopCloudService } from './main/cloud.service';
import { DesktopConfigService } from './main/config.service';
import { detectDesktopEditingTools } from './main/editing-tools.util';
import { buildExternalAppUrl } from './main/external-url.util';
import { detectDesktopLocalTools } from './main/local-tools.util';
import { DesktopLogService } from './main/log.service';
import { buildDesktopMenu } from './main/menu.service';
import {
  createDesktopProcessExceptionHandler,
  DESKTOP_PROCESS_EXCEPTION_SOURCE,
} from './main/process-exceptions.util';
import {
  assertDesktopRuntimeAvailable,
  assertDesktopServerSwitchAvailable,
  commitDesktopRuntimeSwitch,
  createDesktopRuntimeContext,
} from './main/runtime-context.util';
import {
  DesktopServerService,
  type DesktopValueCipher,
} from './main/server.service';
import {
  type DesktopAuthCallbackResult,
  DesktopSessionService,
  type IDesktopSession,
} from './main/session.service';
import { DesktopShortcutsService } from './main/shortcuts.service';
import { DesktopStoreService } from './main/store.service';
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
import {
  DesktopWorkspaceService,
  parseDesktopWorkspaceContext,
} from './main/workspace.service';

const configService = new DesktopConfigService();
// Re-resolved at startup once the in-app server selection can be read.
let environment = configService.getEnvironment();
const mainDir = path.dirname(fileURLToPath(import.meta.url));

const { autoUpdater } = electronUpdater;

let mainWindow: BrowserWindow | null = null;
let bootstrapCache: IDesktopBootstrap | null = null;
let desktopStore: DesktopStoreService;
let sessionService: DesktopSessionService;
const terminalService = new DesktopTerminalService(() => {
  const token = sessionService?.getSession()?.token;
  return token
    ? { GENFEED_API_KEY: token, GENFEED_API_URL: environment.apiEndpoint }
    : null;
});
let isLocalTerminalApproved = false;
let cliAgentRuntimeService: DesktopCliAgentRuntimeService | null = null;
let serverService: DesktopServerService;
let workspaceService: DesktopWorkspaceService;
let cloudService: DesktopCloudService;
let appShellService: DesktopAppShellService;
const runtimeContextId = randomUUID();
let runtimeContextRevision = 0;
let runtimeContextStatus: IDesktopRuntimeContext['status'] = 'ready';
let isDesktopServerSwitchPending = false;
let runtimeContextCache: IDesktopRuntimeContext | null = null;

function getRuntimeContext(): IDesktopRuntimeContext {
  runtimeContextCache ??= createDesktopRuntimeContext({
    environment,
    runtimeId: runtimeContextId,
    revision: runtimeContextRevision,
    status: runtimeContextStatus,
    hasSession: Boolean(sessionService?.getSession()),
  });
  return runtimeContextCache;
}

function emitRuntimeContext(): void {
  runtimeContextRevision += 1;
  runtimeContextCache = null;
  mainWindow?.webContents.send(
    DESKTOP_IPC_CHANNELS.runtimeContextChanged,
    getRuntimeContext(),
  );
}

let logService: DesktopLogService | null = null;

const telemetryService = new DesktopTelemetryService(environment);

const trayService = new DesktopTrayService();
const shortcutsService = new DesktopShortcutsService();

/** Centres the 12px traffic lights in the shell's 40px topbar band. */
const MAC_TRAFFIC_LIGHT_POSITION = { x: 14, y: 18 }; // (48px row - 12px light) / 2

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

/** Server selection is stored with the same OS-backed encryption as sessions. */
const desktopValueCipher: DesktopValueCipher = {
  decrypt: (value) =>
    safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(Buffer.from(value, 'base64'))
      : value,
  encrypt: (value) =>
    safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value).toString('base64')
      : value,
};

const emitQuickGenerate = (): void => {
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.quickGenerate);
};

const emitSession = async (): Promise<void> => {
  const session = sessionService.getSession();
  telemetryService.setUser(session);
  emitRuntimeContext();
  // The API key is a main-process credential and never crosses into the page.
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.authChanged, null);
};

const emitBootstrap = async (): Promise<void> => {
  bootstrapCache = null;
  emitRuntimeContext();
  mainWindow?.webContents.send(
    DESKTOP_IPC_CHANNELS.bootstrapChanged,
    getBootstrap(),
  );
};

const getBootstrap = (): IDesktopBootstrap => {
  bootstrapCache ??= {
    environment: sessionService.getEnvironment(),
    preferences: {
      nativeNotificationsEnabled: Notification.isSupported(),
    },
  };
  return bootstrapCache;
};

const runDataService = async <T>(
  callback: (service: IDesktopDataService) => Promise<IDesktopDataResult<T>>,
): Promise<T> => {
  assertDesktopRuntimeAvailable(runtimeContextStatus);
  const result = await callback(cloudService);
  return result.data;
};

const acquiredSingleInstanceLock = app.requestSingleInstanceLock();

if (!acquiredSingleInstanceLock) {
  app.quit();
}

const getAllowedExternalUrl = (rawUrl: string): URL | null => {
  try {
    const url = new URL(rawUrl);
    // A self-hosted server on this machine or LAN may serve its sign-in page
    // over HTTP; only that exact configured origin is exempt from HTTPS.
    const isConfiguredAuthOrigin =
      url.origin === new URL(environment.authEndpoint).origin;

    if (
      url.password ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && isConfiguredAuthOrigin)) ||
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
    title: 'Genfeed',
    // macOS: the renderer's topbar is the titlebar. The traffic lights sit
    // centred in its first 40px band; the shell leaves room for them.
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION,
    webPreferences: {
      additionalArguments: [
        `--genfeed-app-origin=${appShellService.appOrigin}`,
        `--genfeed-ws-endpoint=${environment.wsEndpoint}`,
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

  const emitWindowChrome = (): void => {
    mainWindow?.webContents.send(
      DESKTOP_IPC_CHANNELS.windowChromeChanged,
      getWindowChromeState(),
    );
  };
  mainWindow.on('enter-full-screen', emitWindowChrome);
  mainWindow.on('leave-full-screen', emitWindowChrome);

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
    await loadCanonicalApp(
      mainWindow,
      appShellService.buildInitialUrl(sessionService.getSession()),
    );

    if (isDev && !isSmokeTest) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    if (isSmokeTest) {
      process.stdout.write(
        '[desktop] smoke readiness confirmed: canonical shell rendered.\n',
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

  buildDesktopMenu(mainWindow);
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
        title: 'Genfeed',
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
  await emitSession();
  await emitBootstrap();
  if (mainWindow) {
    // Reopen the page the completed sign-in started from (#6276).
    await loadCanonicalApp(
      mainWindow,
      appShellService.buildInitialUrl(session, result.continuation),
    );
  }
  void new Notification({
    body: session.userEmail || 'Authenticated successfully.',
    title: 'Genfeed',
  }).show();
  return result;
};

/**
 * `genfeedai-desktop://thread/<id>` opens that agent thread (the web app's
 * "Open in Desktop" for a thread bound to a local CLI); every other link is
 * the sign-in callback.
 */
const handleDeepLink = async (rawUrl: string): Promise<void> => {
  const threadId = parseDesktopThreadLink(rawUrl);
  if (threadId === null) {
    await handleAuthCallback(rawUrl);
    return;
  }

  if (!mainWindow) {
    return;
  }

  await loadCanonicalApp(
    mainWindow,
    new URL(
      `/agent/${encodeURIComponent(threadId)}`,
      appShellService.appOrigin,
    ).toString(),
  );
};

const registerProtocolHandling = (): void => {
  app.setAsDefaultProtocolClient(DESKTOP_APP_PROTOCOL_SCHEME);

  app.on('open-url', (event: { preventDefault(): void }, url: string) => {
    event.preventDefault();
    void handleDeepLink(url);
  });
};

const getWindowChromeState = (): IDesktopWindowChromeState => ({
  isFullScreen: mainWindow?.isFullScreen() ?? false,
});

const registerIpcHandlers = (): void => {
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appRuntimeContext,
    async () => getRuntimeContext(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.windowChromeState,
    async () => getWindowChromeState(),
  );
  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.appBootstrap, async () =>
    getBootstrap(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appDetectLocalTools,
    async () => detectDesktopLocalTools(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appDetectEditingTools,
    async () => detectDesktopEditingTools(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.appGetDiagnostics,
    async () => ({
      isPackaged: app.isPackaged,
      logPath: logService?.getPath() ?? '',
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
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.authLogin,
    async (_event: unknown, continuation: unknown) => {
      // Bound to this PKCE attempt; validated when its callback lands.
      await openValidatedExternalUrl(
        sessionService.getLoginUrl(
          typeof continuation === 'string' ? continuation : undefined,
        ),
      );
    },
  );
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
    async (_event: unknown, topic: string, brandId?: string) =>
      runDataService((service) => service.generateHooks(topic, brandId)),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.cloudGenerateContent,
    async (_event: unknown, params: IDesktopGenerationOptions) => {
      return runDataService((service) => service.generateContent(params));
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
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.notify,
    async (_event: unknown, title: string, body: string) => {
      if (Notification.isSupported()) {
        void new Notification({ body, title }).show();
      }
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.terminalCreate,
    async (event, options?: IDesktopTerminalCreateOptions) => {
      await confirmLocalTerminalAccess();
      return terminalService.createSession(
        options,
        (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(DESKTOP_IPC_CHANNELS.terminalData, payload);
          }
        },
        (payload) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(DESKTOP_IPC_CHANNELS.terminalExit, payload);
          }
        },
      );
    },
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

  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.agentRuntimeStartTurn,
    async (event, request: unknown) =>
      requireCliAgentRuntime().startTurn(request, (payload) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(DESKTOP_IPC_CHANNELS.agentRuntimeEvent, payload);
        }
      }),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.agentRuntimeCancelTurn,
    async (_event: unknown, turnId: unknown) => {
      requireCliAgentRuntime().cancelTurn(turnId);
    },
  );

  registerWorkspaceIpcHandlers();

  registerPrivilegedIpcHandler(DESKTOP_IPC_CHANNELS.serverGetState, async () =>
    serverService.getState(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.serverValidate,
    async (_event: unknown, config: IDesktopSelfHostedServerConfig) =>
      serverService.validateSelfHosted(config),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.serverSelect,
    async (_event: unknown, selection: IDesktopServerSelection) => {
      await switchDesktopServer(selection);
    },
  );
};

const emitWorkspaceState = (): IDesktopWorkspaceState => {
  const state = workspaceService.getState();
  mainWindow?.webContents.send(DESKTOP_IPC_CHANNELS.workspaceChanged, state);
  return state;
};

/** Native folder picker; the page cannot choose a path itself. */
const pickDirectory = async (
  title: string,
  defaultPath?: string,
): Promise<string | null> => {
  const options: Electron.OpenDialogOptions = {
    defaultPath,
    properties: ['openDirectory', 'createDirectory'],
    title,
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
};

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
};

const registerWorkspaceIpcHandlers = (): void => {
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceGetState,
    async () => workspaceService.getState(),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceOpenFolder,
    async (_event: unknown, context: unknown) => {
      const parsed = parseDesktopWorkspaceContext(context);
      const folder = await pickDirectory('Open a workspace folder');
      if (!folder) {
        return null;
      }
      const workspace = workspaceService.openFolder(folder, parsed);
      emitWorkspaceState();
      return workspace;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceCreateProject,
    async (_event: unknown, request: unknown) => {
      const name = isRecord(request) ? request.name : undefined;
      const workspace = workspaceService.createProject({
        ...parseDesktopWorkspaceContext(request),
        name: requireString(name, 'project name'),
      });
      emitWorkspaceState();
      return workspace;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceSetActive,
    async (_event: unknown, workspaceId: unknown) => {
      workspaceService.setActive(
        workspaceId === null
          ? null
          : requireString(workspaceId, 'workspace id'),
      );
      return emitWorkspaceState();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceRemove,
    async (_event: unknown, workspaceId: unknown) => {
      workspaceService.remove(requireString(workspaceId, 'workspace id'));
      emitWorkspaceState();
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceLinkContext,
    async (_event: unknown, workspaceId: unknown, context: unknown) => {
      const workspace = workspaceService.linkContext(
        requireString(workspaceId, 'workspace id'),
        parseDesktopWorkspaceContext(context),
      );
      emitWorkspaceState();
      return workspace;
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceListDirectory,
    async (_event: unknown, workspaceId: unknown, relativePath: unknown) =>
      workspaceService.listDirectory(
        requireString(workspaceId, 'workspace id'),
        relativePath === undefined
          ? undefined
          : requireString(relativePath, 'path'),
      ),
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceReveal,
    async (_event: unknown, workspaceId: unknown) => {
      const workspace = workspaceService.getWorkspace(
        requireString(workspaceId, 'workspace id'),
      );
      shell.showItemInFolder(workspace.path);
    },
  );
  registerPrivilegedIpcHandler(
    DESKTOP_IPC_CHANNELS.workspaceChooseProjectsHome,
    async () => {
      const folder = await pickDirectory(
        'Choose where new projects are created',
        workspaceService.getState().projectsHome,
      );
      if (folder) {
        workspaceService.setProjectsHome(folder);
      }
      return emitWorkspaceState();
    },
  );
};

/**
 * Terminals run arbitrary commands and the shell is a remote origin, so the
 * first terminal of each launch needs a native confirmation that page script
 * cannot answer.
 */
const confirmLocalTerminalAccess = async (): Promise<void> => {
  if (isLocalTerminalApproved) {
    return;
  }

  const options = {
    buttons: ['Allow', 'Cancel'],
    cancelId: 1,
    defaultId: 0,
    detail:
      'Terminals run commands on this computer with your user account. Allow only if you just opened a terminal in Genfeed.',
    message: 'Allow Genfeed to open a terminal on this computer?',
    type: 'question' as const,
  };
  const { response } = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);

  if (response !== 0) {
    throw new Error('Terminal access was not allowed.');
  }

  isLocalTerminalApproved = true;
};

const requireCliAgentRuntime = (): DesktopCliAgentRuntimeService => {
  if (!cliAgentRuntimeService) {
    throw new Error('The local agent runtime is still starting.');
  }

  return cliAgentRuntimeService;
};

/**
 * Server switches are confirmed natively, persisted, and applied by
 * relaunching so the app shell, its /v1 proxy, sessions, and the MCP
 * endpoint are all rebuilt for the new server.
 */
const switchDesktopServer = async (
  selection: IDesktopServerSelection,
): Promise<void> => {
  assertDesktopServerSwitchAvailable(
    runtimeContextStatus,
    isDesktopServerSwitchPending,
  );
  isDesktopServerSwitchPending = true;
  try {
    const target =
      selection?.kind === 'self-hosted'
        ? selection.selfHosted?.apiEndpoint || 'your self-hosted server'
        : 'Genfeed Cloud';
    const options = {
      buttons: ['Restart', 'Cancel'],
      cancelId: 1,
      defaultId: 0,
      detail:
        'Genfeed Desktop restarts to connect. You stay signed in to each server separately.',
      message: `Switch Genfeed Desktop to ${target}?`,
      type: 'question' as const,
    };
    const { response } = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);

    const profile = await commitDesktopRuntimeSwitch(
      () => runtimeContextStatus,
      response === 0,
      () => serverService.select(selection),
      (status) => {
        runtimeContextStatus = status;
        emitRuntimeContext();
      },
    );
    logService?.info(`switching desktop server to ${profile.id}`);
    cliAgentRuntimeService?.cancelAll();
    terminalService.killAll();
    await sessionService.detachShellCookie();
    await appShellService.stop();
    app.relaunch();
    app.exit(0);
  } finally {
    isDesktopServerSwitchPending = false;
  }
};

app.on('before-quit', (event) => {
  if (isQuitting) {
    return;
  }

  event.preventDefault();
  isQuitting = true;

  void (async () => {
    try {
      cliAgentRuntimeService?.cancelAll();
      terminalService.killAll();
      await appShellService?.stop();
    } finally {
      shortcutsService.unregister();
      trayService.destroy();
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
    serverService = new DesktopServerService(
      desktopStore,
      desktopValueCipher,
      configService.getDefaultServerProfile(),
    );
    environment = configService.getEnvironment(
      serverService.getActiveProfile(),
    );
    workspaceService = new DesktopWorkspaceService(desktopStore, {
      getServerId: () => environment.serverId,
    });
    EXTERNAL_NAVIGATION_HOSTS.add(new URL(environment.authEndpoint).hostname);
    logService.info(`desktop server ${environment.serverId}`);
    appShellService = new DesktopAppShellService(
      environment,
      () => sessionService.getSession(),
      // Spawned server processes carve their own storage directories out of the
      // Electron data root.
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
    cliAgentRuntimeService = new DesktopCliAgentRuntimeService({
      cloud: cloudService,
      getMcpEndpoint: () => environment.mcpEndpoint,
      getSessionToken: () => sessionService.getSession()?.token ?? null,
      log: (level, message) => logService?.write(level, message),
      workDir: path.join(app.getPath('userData'), 'cli-agent'),
    });
    runtimeContextCache = null;
    getRuntimeContext();
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
      value.startsWith(`${DESKTOP_APP_PROTOCOL_SCHEME}://`),
    );

    if (deepLinkArgument) {
      void handleDeepLink(deepLinkArgument);
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
    value.startsWith(`${DESKTOP_APP_PROTOCOL_SCHEME}://`),
  );

  if (deepLinkArgument) {
    void handleDeepLink(deepLinkArgument);
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
