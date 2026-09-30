import { isDesktopClient } from '@genfeedai/config/deployment';
import type { CreditsVisibilityContext } from '@genfeedai/config/license';
import type {
  IDesktopRuntimeContext,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';

export interface DesktopRuntimeSnapshot {
  status: 'web' | 'loading' | 'ready' | 'switching' | 'unavailable';
  context: IDesktopRuntimeContext | null;
}

type RuntimeBridge = Pick<
  IGenfeedDesktopBridge['app'],
  'getRuntimeContext' | 'onDidChangeRuntimeContext'
>;
const UNKNOWN: DesktopRuntimeSnapshot = Object.freeze({
  status: 'loading',
  context: null,
});
const WEB: DesktopRuntimeSnapshot = Object.freeze({
  status: 'web',
  context: null,
});
const UNAVAILABLE: DesktopRuntimeSnapshot = Object.freeze({
  status: 'unavailable',
  context: null,
});
const PROVIDERS = [
  'fal',
  'lm-studio',
  'ollama',
  'openai-compatible',
  'replicate',
];

export function isDesktopRuntimeShell(): boolean {
  return (
    typeof window !== 'undefined' &&
    (isDesktopClient() ||
      Boolean((window as Window & { genfeedDesktop?: unknown }).genfeedDesktop))
  );
}

function readBridge(): RuntimeBridge | null {
  const bridge = (
    globalThis as typeof globalThis & { genfeedDesktop?: IGenfeedDesktopBridge }
  ).genfeedDesktop?.app;
  return typeof bridge?.getRuntimeContext === 'function' &&
    typeof bridge?.onDidChangeRuntimeContext === 'function'
    ? bridge
    : null;
}

function decodeContext(value: unknown): IDesktopRuntimeContext | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (
    data.version !== 1 ||
    typeof data.runtimeId !== 'string' ||
    !data.runtimeId ||
    !Number.isInteger(data.revision) ||
    Number(data.revision) < 0 ||
    !['ready', 'switching'].includes(String(data.status)) ||
    typeof data.selectedServerId !== 'string' ||
    !data.selectedServerId ||
    !['cloud', 'self-hosted'].includes(String(data.selectedServerKind)) ||
    typeof data.selectedApiEndpoint !== 'string' ||
    !['cloud', 'local'].includes(String(data.runtimeMode)) ||
    !['remote', 'local-byok', 'unknown'].includes(
      String(data.generationExecution),
    )
  )
    return null;
  try {
    const url = new URL(data.selectedApiEndpoint);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
  } catch {
    return null;
  }
  let localProvider: IDesktopRuntimeContext['localProvider'] = null;
  if (data.localProvider !== null) {
    if (!data.localProvider || typeof data.localProvider !== 'object')
      return null;
    const provider = data.localProvider as Record<string, unknown>;
    if (
      !PROVIDERS.includes(String(provider.provider)) ||
      !['local', 'remote', 'unknown'].includes(String(provider.networkAccess))
    )
      return null;
    localProvider = {
      provider: provider.provider as NonNullable<
        IDesktopRuntimeContext['localProvider']
      >['provider'],
      networkAccess: provider.networkAccess as NonNullable<
        IDesktopRuntimeContext['localProvider']
      >['networkAccess'],
    };
  }
  if (
    data.generationExecution === 'local-byok' &&
    (data.runtimeMode !== 'local' || !localProvider)
  )
    return null;
  if (data.generationExecution === 'remote' && data.runtimeMode !== 'cloud')
    return null;
  if (
    localProvider &&
    (data.runtimeMode !== 'local' || data.generationExecution !== 'local-byok')
  )
    return null;
  return {
    version: 1,
    runtimeId: data.runtimeId,
    revision: Number(data.revision),
    status: data.status as IDesktopRuntimeContext['status'],
    selectedServerId: data.selectedServerId,
    selectedServerKind:
      data.selectedServerKind as IDesktopRuntimeContext['selectedServerKind'],
    selectedApiEndpoint: data.selectedApiEndpoint,
    runtimeMode: data.runtimeMode as IDesktopRuntimeContext['runtimeMode'],
    generationExecution:
      data.generationExecution as IDesktopRuntimeContext['generationExecution'],
    localProvider,
  };
}

/** Only one allowlisted subscription/RPC, with no persisted environment or credentials. */
export class DesktopRuntimeService {
  private snapshot: DesktopRuntimeSnapshot = UNKNOWN;
  private listeners = new Set<() => void>();
  private detach: (() => void) | null = null;
  private epoch = 0;
  private started = false;
  private accepted: IDesktopRuntimeContext | null = null;

  constructor(
    private readonly detect = isDesktopRuntimeShell,
    private readonly bridge = readBridge,
  ) {}

  getServerSnapshot = (): DesktopRuntimeSnapshot => UNKNOWN;
  getSnapshot = (): DesktopRuntimeSnapshot => this.snapshot;
  getCurrentSnapshot = (): DesktopRuntimeSnapshot =>
    this.detect() ? this.snapshot : WEB;

  private publish(snapshot: DesktopRuntimeSnapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (!this.started) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      this.epoch += 1;
      this.detach?.();
      this.detach = null;
      this.started = false;
      this.accepted = null;
      this.snapshot = UNKNOWN;
    };
  };

  private start(): void {
    this.started = true;
    const epoch = ++this.epoch;
    if (!this.detect()) {
      this.publish(WEB);
      return;
    }
    const bridge = this.bridge();
    if (!bridge) {
      this.publish(UNAVAILABLE);
      return;
    }
    this.publish(UNKNOWN);
    let receivedEvent = false;
    const accept = (value: unknown, fromRpc: boolean) => {
      if (fromRpc && receivedEvent) return;
      if (!fromRpc) receivedEvent = true;
      if (epoch !== this.epoch || !this.listeners.size) return;
      const context = decodeContext(value);
      if (!context) {
        this.publish(UNAVAILABLE);
        return;
      }
      if (this.accepted) {
        if (fromRpc && context.runtimeId !== this.accepted.runtimeId) return;
        if (
          context.runtimeId === this.accepted.runtimeId &&
          context.revision <= this.accepted.revision
        )
          return;
      }
      this.accepted = context;
      this.publish({ status: context.status, context });
    };
    try {
      this.detach = bridge.onDidChangeRuntimeContext((context) =>
        accept(context, false),
      );
      void Promise.resolve(bridge.getRuntimeContext()).then(
        (context) => accept(context, true),
        () => {
          if (epoch === this.epoch && !this.accepted) this.publish(UNAVAILABLE);
        },
      );
    } catch {
      this.publish(UNAVAILABLE);
    }
  }
}

export const desktopRuntimeService = new DesktopRuntimeService();

export function getDesktopCreditsVisibility(
  snapshot: DesktopRuntimeSnapshot,
): CreditsVisibilityContext {
  const isReady =
    snapshot.status === 'ready' &&
    (snapshot.context?.runtimeMode === 'local' ||
      snapshot.context?.generationExecution === 'remote');
  return snapshot.status === 'web'
    ? { clientSurface: 'web' }
    : {
        clientSurface: 'desktop',
        selectedServerKind: isReady
          ? snapshot.context?.selectedServerKind
          : null,
        runtimeMode: isReady ? snapshot.context?.runtimeMode : 'unknown',
        generationExecution: snapshot.context?.generationExecution ?? 'unknown',
      };
}

export function canSubmitStudioGeneration(
  snapshot = desktopRuntimeService.getCurrentSnapshot(),
): boolean {
  return (
    snapshot.status === 'web' ||
    (snapshot.status === 'ready' &&
      snapshot.context?.runtimeMode === 'cloud' &&
      snapshot.context.generationExecution === 'remote')
  );
}

export function getDesktopLocalCostState(
  snapshot: DesktopRuntimeSnapshot,
): 'unknown' | 'missing' | 'local' | 'remote' {
  if (snapshot.status !== 'ready' || snapshot.context?.runtimeMode !== 'local')
    return 'unknown';
  const provider = snapshot.context.localProvider;
  if (!provider) return 'missing';
  if (provider.networkAccess === 'local') return 'local';
  if (provider.networkAccess === 'remote') return 'remote';
  return 'unknown';
}
