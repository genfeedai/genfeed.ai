import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PromptTemplate, RunRecord } from '@/types';

type CommandHandler = (...args: unknown[]) => unknown;

type FakeWebviewMessageHandler = (message: {
  command: string;
}) => void | Promise<void>;

type FakeCommandProviders = {
  analyticsProvider: {
    refreshAnalytics(): Promise<void>;
  };
  galleryProvider: {
    refreshMedia(): Promise<void>;
  };
  presetsProvider: {
    refreshPresets(): Promise<void>;
  };
  runQueueProvider: {
    refreshRuns(): Promise<void>;
  };
  templatesProvider: {
    refreshTemplates(): Promise<void>;
  };
  statusBar: {
    refresh(): Promise<void>;
  };
};

type FakeExtensionContext = {
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

type FakeTextDocument = {
  readonly uri: FakeUri;
};

type FakeUri = {
  readonly fsPath: string;
  readonly query: string;
  toString(): string;
};

type FakeWorkspaceEditInsert = {
  position: { character: number; line: number };
  text: string;
  uri: FakeUri;
};

const commandHandlers = new Map<string, CommandHandler>();
const executedCommands: Array<{ args: unknown[]; command: string }> = [];
const clipboardWrites: string[] = [];
const informationResponses: Array<string | undefined> = [];
const warningResponses: Array<string | undefined> = [];
const inputResponses: Array<string | undefined> = [];
const quickPickResponses: Array<string | PromptTemplate | undefined> = [];
const postedMessages: Array<Record<string, unknown>> = [];
const showTextDocumentCalls: Array<{
  document: FakeTextDocument;
  preview?: boolean;
}> = [];
const applyEditInserts: FakeWorkspaceEditInsert[] = [];
const apiCalls = {
  createAndExecuteRun: [] as Array<{
    actionType: string;
    input: Record<string, unknown>;
    options?: Record<string, unknown>;
  }>,
  saveDraft: [] as Array<Record<string, unknown>>,
};
const providerRefreshCounts = {
  analytics: 0,
  gallery: 0,
  presets: 0,
  runQueue: 0,
  templates: 0,
};
const authState = {
  authenticated: true,
};
const fakeWorkspaceFolders: Array<{ uri: FakeUri }> = [];
const openedDocuments = new Map<string, FakeTextDocument>();

function createUri(value: string): FakeUri {
  const [, query = ''] = value.split('?');
  return {
    fsPath: value.startsWith('file://') ? value.slice('file://'.length) : value,
    query,
    toString: () => value,
  };
}

function resetState(): void {
  commandHandlers.clear();
  executedCommands.length = 0;
  clipboardWrites.length = 0;
  informationResponses.length = 0;
  warningResponses.length = 0;
  inputResponses.length = 0;
  quickPickResponses.length = 0;
  postedMessages.length = 0;
  showTextDocumentCalls.length = 0;
  applyEditInserts.length = 0;
  apiCalls.createAndExecuteRun.length = 0;
  apiCalls.saveDraft.length = 0;
  providerRefreshCounts.analytics = 0;
  providerRefreshCounts.gallery = 0;
  providerRefreshCounts.presets = 0;
  providerRefreshCounts.runQueue = 0;
  providerRefreshCounts.templates = 0;
  authState.authenticated = true;
  fakeWorkspaceFolders.length = 0;
  openedDocuments.clear();
}

function createExtensionContext(): FakeExtensionContext {
  const globalState = new Map<string, unknown>();
  const secrets = new Map<string, string>();

  return {
    extensionUri: { toString: () => 'file:///extension' },
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

function createProviders(): FakeCommandProviders {
  return {
    analyticsProvider: {
      async refreshAnalytics(): Promise<void> {
        providerRefreshCounts.analytics += 1;
      },
    },
    galleryProvider: {
      async refreshMedia(): Promise<void> {
        providerRefreshCounts.gallery += 1;
      },
    },
    presetsProvider: {
      async refreshPresets(): Promise<void> {
        providerRefreshCounts.presets += 1;
      },
    },
    runQueueProvider: {
      async refreshRuns(): Promise<void> {
        providerRefreshCounts.runQueue += 1;
      },
    },
    statusBar: {
      async refresh(): Promise<void> {},
    },
    templatesProvider: {
      async refreshTemplates(): Promise<void> {
        providerRefreshCounts.templates += 1;
      },
    },
  };
}

function createWebviewView(): {
  readonly webviewView: {
    readonly webview: {
      cspSource: string;
      html: string;
      onDidReceiveMessage(handler: FakeWebviewMessageHandler): {
        dispose(): void;
      };
      options: { enableScripts: boolean };
      postMessage(message: Record<string, unknown>): void;
    };
  };
  readonly getMessageHandler: () => FakeWebviewMessageHandler | undefined;
} {
  let messageHandler: FakeWebviewMessageHandler | undefined;

  const webview = {
    cspSource: 'vscode-resource:',
    html: '',
    onDidReceiveMessage(handler: FakeWebviewMessageHandler) {
      messageHandler = handler;
      return {
        dispose() {},
      };
    },
    options: {
      enableScripts: false,
    },
    postMessage(message: Record<string, unknown>) {
      postedMessages.push(message);
    },
  };

  return {
    getMessageHandler: () => messageHandler,
    webviewView: {
      webview,
    },
  };
}

mock.module('vscode', () => {
  class Position {
    constructor(
      public readonly line: number,
      public readonly character: number,
    ) {}
  }

  class WorkspaceEdit {
    readonly inserts: FakeWorkspaceEditInsert[] = [];

    insert(uri: FakeUri, position: Position, text: string): void {
      this.inserts.push({ position, text, uri });
    }
  }

  const commands = {
    async executeCommand(
      command: string,
      ...args: unknown[]
    ): Promise<unknown> {
      executedCommands.push({ args, command });
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

  const workspace = {
    applyEdit(edit: WorkspaceEdit): Promise<boolean> {
      applyEditInserts.push(...edit.inserts);
      return Promise.resolve(true);
    },
    getConfiguration() {
      return {
        get<T>(_key: string, defaultValue?: T): T | undefined {
          return defaultValue;
        },
        async update(): Promise<void> {},
      };
    },
    onDidChangeWorkspaceFolders() {
      return {
        dispose() {},
      };
    },
    async openTextDocument(uri: FakeUri): Promise<FakeTextDocument> {
      const document = { uri };
      openedDocuments.set(uri.toString(), document);
      return document;
    },
    get workspaceFolders() {
      return fakeWorkspaceFolders;
    },
  };

  const window = {
    createOutputChannel() {
      return {
        appendLine() {},
        dispose() {},
      };
    },
    async showErrorMessage(message: string): Promise<string | undefined> {
      warningResponses.push(message);
      return undefined;
    },
    async showInformationMessage(
      _message: string,
      ..._items: string[]
    ): Promise<string | undefined> {
      return informationResponses.shift();
    },
    async showInputBox(): Promise<string | undefined> {
      return inputResponses.shift();
    },
    async showQuickPick(): Promise<string | PromptTemplate | undefined> {
      return quickPickResponses.shift();
    },
    async showTextDocument(
      document: FakeTextDocument,
      options?: { preview?: boolean },
    ): Promise<FakeTextDocument> {
      showTextDocumentCalls.push({
        document,
        preview: options?.preview,
      });
      return document;
    },
    async showWarningMessage(
      _message: string,
      ..._items: string[]
    ): Promise<string | undefined> {
      return warningResponses.shift();
    },
    async withProgress<T>(
      _options: { cancellable: boolean; location: number; title: string },
      task: (
        progress: { report(value: Record<string, unknown>): void },
        token: { isCancellationRequested: boolean },
      ) => Promise<T>,
    ): Promise<T> {
      return await task(
        {
          report() {},
        },
        {
          isCancellationRequested: false,
        },
      );
    },
  };

  const env = {
    asExternalUri: async (uri: FakeUri) => uri,
    clipboard: {
      async writeText(text: string): Promise<void> {
        clipboardWrites.push(text);
      },
    },
    openExternal: async () => true,
    uriScheme: 'vscode',
  };

  const Uri = {
    file(path: string): FakeUri {
      return createUri(`file://${path}`);
    },
    parse(value: string): FakeUri {
      return createUri(value);
    },
  };

  return {
    ConfigurationTarget: {
      Workspace: 1,
    },
    commands,
    env,
    Position,
    ProgressLocation: {
      Notification: 1,
    },
    StatusBarAlignment: {
      Right: 1,
    },
    Uri,
    WorkspaceEdit,
    window,
    workspace,
  };
});

mock.module('@services/auth.service', () => ({
  AuthService: class AuthService {
    static getInstance(): AuthService {
      return new AuthService();
    }

    static initialize(): AuthService {
      return new AuthService();
    }

    async authenticateWithDeviceFlow(): Promise<boolean> {
      authState.authenticated = true;
      return true;
    }

    async loadStoredAuth(): Promise<void> {}

    async setApiKey(): Promise<boolean> {
      authState.authenticated = true;
      return true;
    }

    async signOut(): Promise<void> {
      authState.authenticated = false;
    }

    getAuthState(): { method: string } {
      return { method: 'deviceFlow' };
    }

    getToken(): Promise<string | undefined> {
      return Promise.resolve(
        authState.authenticated ? 'gf_test_token' : undefined,
      );
    }

    isAuthenticated(): boolean {
      return authState.authenticated;
    }
  },
}));

mock.module('@services/api.service', () => ({
  ApiService: class ApiService {
    static getInstance(): ApiService {
      return new ApiService();
    }

    async createAndExecuteRun(
      actionType: string,
      input: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<RunRecord> {
      apiCalls.createAndExecuteRun.push({ actionType, input, options });
      return {
        _id: `run-${actionType}`,
        actionType,
        output: {
          text: 'Generated post content',
        },
        progress: 100,
        status: 'completed',
      } as RunRecord;
    }

    async getContentTemplates(): Promise<PromptTemplate[]> {
      return [];
    }

    async getRun(runId: string): Promise<RunRecord> {
      return {
        _id: runId,
        actionType: 'generate',
        progress: 100,
        status: 'completed',
      } as RunRecord;
    }

    async getRunTimeline(): Promise<Array<Record<string, unknown>>> {
      return [];
    }

    async listRuns(): Promise<RunRecord[]> {
      return [];
    }

    async saveDraft(payload: Record<string, unknown>): Promise<void> {
      apiCalls.saveDraft.push(payload);
    }
  },
}));

mock.module('@services/error-tracking.service', () => ({
  captureExtensionError(): void {},
  async flushErrorTracking(): Promise<void> {},
  initializeErrorTracking(): void {},
}));

mock.module('@services/workspace.service', () => ({
  WorkspaceService: class WorkspaceService {
    static createTimelineEvent(
      stage: string,
      message: string,
      level: string,
      data?: Record<string, unknown>,
    ): Record<string, unknown> {
      return {
        data,
        level,
        message,
        stage,
        timestamp: '2026-04-01T00:00:00.000Z',
      };
    }

    static getWorkspaceName(): string {
      return 'qa-workspace';
    }

    static getWorkspaceRootPath(): string | undefined {
      return fakeWorkspaceFolders[0]?.uri.fsPath;
    }

    static async readCampaignDefaults(): Promise<Record<string, string>> {
      return {};
    }

    static async writeCampaignDefaults(): Promise<string> {
      return '/tmp/genfeed-campaign.json';
    }

    static async writeCampaignDraft(): Promise<string> {
      return '/tmp/genfeed-campaign-draft.json';
    }

    static async writeRunArtifacts(): Promise<string> {
      return '/tmp/genfeed-run-artifacts.json';
    }
  },
}));

let registerCommands: (context: never, providers: never) => void;
let triggerCommitToPost: (
  context: never,
  commitMessage: string,
) => Promise<void>;
let RunQueueViewProvider: new () => {
  resolveWebviewView(webviewView: never, context: never, token: never): void;
};

({ registerCommands } = await import('./commands'));
({ triggerCommitToPost } = await import('./commands/commit-to-post'));
({ RunQueueViewProvider } = await import('./views/run-queue-view.provider'));

describe('IDE extension workflows', () => {
  beforeEach(() => {
    resetState();
  });

  it('opens the Genfeed sidebar and focuses the run queue', async () => {
    const context = createExtensionContext();
    const providers = createProviders();

    registerCommands(context as never, providers as never);
    const openPanel = commandHandlers.get('genfeed.openPanel');

    expect(openPanel).toBeDefined();
    await openPanel?.();

    expect(executedCommands.map((entry) => entry.command)).toEqual([
      'workbench.view.extension.genfeed-sidebar',
      'genfeed.runQueueView.focus',
    ]);
  });

  it('runs the generate content workflow with campaign context and refreshes views', async () => {
    const context = createExtensionContext();
    const providers = createProviders();

    registerCommands(context as never, providers as never);

    inputResponses.push('Launch Week Campaign', 'Create five launch hooks');
    quickPickResponses.push('x');
    informationResponses.push(undefined);

    const generateContent = commandHandlers.get('genfeed.generateContent');

    expect(generateContent).toBeDefined();
    await generateContent?.();

    expect(apiCalls.createAndExecuteRun).toHaveLength(1);
    expect(apiCalls.createAndExecuteRun[0]).toEqual({
      actionType: 'generate',
      input: {
        campaign: {
          channel: 'x',
          name: 'Launch Week Campaign',
          objective: undefined,
        },
        prompt: 'Create five launch hooks',
      },
      options: {
        campaign: {
          actionInput: 'Create five launch hooks',
          actionType: 'generate',
          campaignName: 'Launch Week Campaign',
          channel: 'x',
          objective: undefined,
        },
        metadata: {
          campaignName: 'Launch Week Campaign',
          channel: 'x',
          source: 'ide.command',
          workspace: 'qa-workspace',
        },
      },
    });
    expect(providerRefreshCounts).toEqual({
      analytics: 1,
      gallery: 1,
      presets: 1,
      runQueue: 1,
      templates: 1,
    });
  });

  it('routes run queue webview authentication through the command bus', async () => {
    authState.authenticated = false;

    const provider = new RunQueueViewProvider();
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView.webviewView as never,
      {} as never,
      {} as never,
    );

    expect(webviewView.webviewView.webview.html).toContain(
      'Sign in to view and control your run queue.',
    );
    expect(postedMessages[0]).toEqual({
      authenticated: false,
      loading: false,
      runs: [],
      type: 'update',
    });

    const messageHandler = webviewView.getMessageHandler();
    expect(messageHandler).toBeDefined();

    await messageHandler?.({ command: 'authenticate' });

    expect(executedCommands.map((entry) => entry.command)).toContain(
      'genfeed.authenticate',
    );
  });

  it('turns a commit message into a post draft', async () => {
    const context = createExtensionContext();

    informationResponses.push('Yes', 'Save to Drafts');
    quickPickResponses.push('linkedin');

    await triggerCommitToPost(
      context as never,
      'feat: ship the Paperclip inbox workflow',
    );

    expect(apiCalls.createAndExecuteRun).toHaveLength(1);
    expect(apiCalls.createAndExecuteRun[0]).toEqual({
      actionType: 'generate',
      input: {
        channel: 'linkedin',
        prompt: expect.stringContaining(
          'feat: ship the Paperclip inbox workflow',
        ),
      },
      options: undefined,
    });
    expect(showTextDocumentCalls).toHaveLength(1);
    expect(showTextDocumentCalls[0]?.preview).toBe(true);
    expect(applyEditInserts.map((edit) => edit.text)).toEqual([
      'Generated post content',
    ]);
    expect(apiCalls.saveDraft).toEqual([
      {
        channel: 'linkedin',
        commitMessage: 'feat: ship the Paperclip inbox workflow',
        content: 'Generated post content',
        sourceRunId: 'run-generate',
        sourceType: 'commit-to-post',
      },
    ]);
    expect(executedCommands.map((entry) => entry.command)).toContain(
      'genfeed.refreshStatusBar',
    );
  });
});
