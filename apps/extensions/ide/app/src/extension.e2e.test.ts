import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

type CommandHandler = (...args: unknown[]) => unknown;

type ExtensionContextLike = {
  extensionUri: { toString(): string };
  globalState: {
    get<T>(key: string): T | undefined;
    update(key: string, value: unknown): Promise<void>;
  };
  secrets: {
    get(key: string): Promise<string | undefined>;
    store(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  subscriptions: { dispose?(): void }[];
};

const commandHandlers = new Map<string, CommandHandler>();
const executedCommands: string[] = [];
const informationResponses: Array<string | undefined> = [];
const informationMessages: string[] = [];
const registeredViewProviders: string[] = [];
const authEvents = {
  initializeCalls: 0,
  loadStoredAuthCalls: 0,
};
const commandRegistrationCalls: Array<{
  analyticsProvider: unknown;
  galleryProvider: unknown;
  presetsProvider: unknown;
  runQueueProvider: unknown;
  statusBar: unknown;
  templatesProvider: unknown;
}> = [];
const watcherCalls = {
  registerCalls: 0,
};
const statusBarCalls = {
  constructorCalls: 0,
  startCalls: 0,
};

process.env.NODE_ENV = 'test';

function resetState(): void {
  commandHandlers.clear();
  executedCommands.length = 0;
  informationResponses.length = 0;
  informationMessages.length = 0;
  registeredViewProviders.length = 0;
  authEvents.initializeCalls = 0;
  authEvents.loadStoredAuthCalls = 0;
  commandRegistrationCalls.length = 0;
  watcherCalls.registerCalls = 0;
  statusBarCalls.constructorCalls = 0;
  statusBarCalls.startCalls = 0;
}

function createExtensionContext(): ExtensionContextLike {
  const globalState = new Map<string, unknown>();
  const secrets = new Map<string, string>();

  return {
    extensionUri: {
      toString: () => 'file:///extension',
    },
    globalState: {
      get<T>(key: string): T | undefined {
        return globalState.get(key) as T | undefined;
      },
      async update(key: string, value: unknown): Promise<void> {
        globalState.set(key, value);
      },
    },
    secrets: {
      async delete(key: string): Promise<void> {
        secrets.delete(key);
      },
      async get(key: string): Promise<string | undefined> {
        return secrets.get(key);
      },
      async store(key: string, value: string): Promise<void> {
        secrets.set(key, value);
      },
    },
    subscriptions: [],
  };
}

mock.module('vscode', () => {
  const commands = {
    async executeCommand(
      command: string,
      ...args: unknown[]
    ): Promise<unknown> {
      executedCommands.push(command);
      const handler = commandHandlers.get(command);
      if (!handler) {
        return undefined;
      }

      return await handler(...args);
    },
    registerCommand(command: string, handler: CommandHandler) {
      commandHandlers.set(command, handler);
      return {
        dispose() {
          commandHandlers.delete(command);
        },
      };
    },
  };

  const window = {
    createOutputChannel() {
      return {
        appendLine() {},
        dispose() {},
      };
    },
    registerWebviewViewProvider(viewType: string) {
      registeredViewProviders.push(viewType);
      return {
        dispose() {},
      };
    },
    async showInformationMessage(message: string) {
      informationMessages.push(message);
      return informationResponses.shift();
    },
  };

  return {
    commands,
    env: {
      appName: 'VS Code',
    },
    extensions: {
      getExtension() {
        return undefined;
      },
    },
    window,
  };
});

mock.module('@services/auth.service', () => ({
  AuthService: class AuthService {
    static getInstance(): AuthService {
      return new AuthService();
    }

    static initialize(): AuthService {
      authEvents.initializeCalls += 1;
      return new AuthService();
    }

    async loadStoredAuth(): Promise<void> {
      authEvents.loadStoredAuthCalls += 1;
    }

    isAuthenticated(): boolean {
      return false;
    }
  },
}));

mock.module('./services/auth.service', () => ({
  AuthService: class AuthService {
    static getInstance(): AuthService {
      return new AuthService();
    }

    static initialize(): AuthService {
      authEvents.initializeCalls += 1;
      return new AuthService();
    }

    async loadStoredAuth(): Promise<void> {
      authEvents.loadStoredAuthCalls += 1;
    }

    isAuthenticated(): boolean {
      return false;
    }
  },
}));

mock.module('@/commands', () => ({
  registerCommands(
    _context: ExtensionContextLike,
    providers: {
      analyticsProvider: unknown;
      galleryProvider: unknown;
      presetsProvider: unknown;
      runQueueProvider: unknown;
      statusBar: unknown;
      templatesProvider: unknown;
    },
  ): void {
    commandRegistrationCalls.push(providers);
  },
}));

mock.module('./commands', () => ({
  registerCommands(
    _context: ExtensionContextLike,
    providers: {
      analyticsProvider: unknown;
      galleryProvider: unknown;
      presetsProvider: unknown;
      runQueueProvider: unknown;
      statusBar: unknown;
      templatesProvider: unknown;
    },
  ): void {
    commandRegistrationCalls.push(providers);
  },
}));

mock.module('@/commands/commit-to-post', () => ({
  registerCommitToPostWatcher(): void {
    watcherCalls.registerCalls += 1;
  },
}));

mock.module('./commands/commit-to-post', () => ({
  registerCommitToPostWatcher(): void {
    watcherCalls.registerCalls += 1;
  },
}));

mock.module('@/statusBar', () => ({
  GenFeedStatusBar: class GenFeedStatusBar {
    constructor() {
      statusBarCalls.constructorCalls += 1;
    }

    start(): void {
      statusBarCalls.startCalls += 1;
    }
  },
}));

mock.module('./statusBar', () => ({
  GenFeedStatusBar: class GenFeedStatusBar {
    constructor() {
      statusBarCalls.constructorCalls += 1;
    }

    start(): void {
      statusBarCalls.startCalls += 1;
    }
  },
}));

function createViewProviderMock(viewType: string) {
  return class ViewProviderMock {
    static readonly viewType = viewType;

    constructor(_extensionUri?: unknown) {}
  };
}

mock.module('@views/analytics-view.provider', () => ({
  AnalyticsViewProvider: createViewProviderMock('genfeed.analyticsView'),
}));
mock.module('./views/analytics-view.provider', () => ({
  AnalyticsViewProvider: createViewProviderMock('genfeed.analyticsView'),
}));

mock.module('@views/gallery-view.provider', () => ({
  GalleryViewProvider: createViewProviderMock('genfeed.galleryView'),
}));
mock.module('./views/gallery-view.provider', () => ({
  GalleryViewProvider: createViewProviderMock('genfeed.galleryView'),
}));

mock.module('@views/presets-view.provider', () => ({
  PresetsViewProvider: createViewProviderMock('genfeed.presetsView'),
}));
mock.module('./views/presets-view.provider', () => ({
  PresetsViewProvider: createViewProviderMock('genfeed.presetsView'),
}));

mock.module('@views/run-queue-view.provider', () => ({
  RunQueueViewProvider: createViewProviderMock('genfeed.runQueueView'),
}));
mock.module('./views/run-queue-view.provider', () => ({
  RunQueueViewProvider: createViewProviderMock('genfeed.runQueueView'),
}));

mock.module('@views/templates-view.provider', () => ({
  TemplatesViewProvider: createViewProviderMock('genfeed.templatesView'),
}));
mock.module('./views/templates-view.provider', () => ({
  TemplatesViewProvider: createViewProviderMock('genfeed.templatesView'),
}));

let activate: (context: never) => Promise<void>;

describe('activate', () => {
  beforeAll(async () => {
    ({ activate } = await import('./extension'));
  });

  beforeEach(() => {
    resetState();
  });

  it('registers webview providers, commands, and first-run welcome flow', async () => {
    const context = createExtensionContext();
    informationResponses.push('Sign In');

    await activate(context as never);

    expect(authEvents.initializeCalls).toBe(1);
    expect(authEvents.loadStoredAuthCalls).toBe(1);
    expect(registeredViewProviders).toEqual([
      'genfeed.presetsView',
      'genfeed.galleryView',
      'genfeed.runQueueView',
      'genfeed.templatesView',
      'genfeed.analyticsView',
    ]);
    expect(commandRegistrationCalls).toHaveLength(1);
    expect(statusBarCalls.constructorCalls).toBe(1);
    expect(statusBarCalls.startCalls).toBe(1);
    expect(watcherCalls.registerCalls).toBe(1);
    expect(executedCommands).toContain('genfeed.authenticate');
    expect(context.globalState.get<boolean>('genfeed.welcomeShown')).toBe(true);
  });

  it('skips the welcome prompt after the first activation', async () => {
    const context = createExtensionContext();
    await context.globalState.update('genfeed.welcomeShown', true);

    await activate(context as never);

    expect(informationMessages).toHaveLength(0);
    expect(executedCommands).not.toContain('genfeed.authenticate');
  });
});
