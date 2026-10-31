import type {
  NativeHostAction,
  NativeHostGeneratedResponse,
} from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import {
  isNativeHostProviderId,
  NATIVE_HOST_PROVIDER_LABELS,
  type NativeHostProviderIdValue,
  REPLY_VARIANTS_DEFAULT,
  REPLY_VARIANTS_MAX,
} from '@genfeedai/contracts/constants';
import type {
  ReplyVariantsResult,
  TextActionResult,
} from '@genfeedai/contracts/interfaces';
import type {
  ActionRecovery,
  ActionRouting,
  CloudFallbackReason,
} from '@genfeedai/contracts/interfaces/extension/extension-action-routing.interface';
import { AgentToolsService } from '~services/agent-tools.service';
import { authService } from '~services/auth.service';
import {
  type LocalVoice,
  loadLocalVoice,
  refreshLocalVoiceCache,
  VoiceUnavailableError,
} from '~services/brand-voice-snapshot.service';
import { classifyCloudFailure } from '~services/cloud-failure';
import {
  NativeHostError,
  runNativeHostAction,
} from '~services/native-host.service';
import { assertWorkspace, requireWorkspace } from '~services/workspace.service';
import { EXTENSION_SETTINGS_STORAGE_KEY } from '~theme/theme-storage';
import type { ReplyVariantsRequest, TextActionRequest } from '~types/extension';
import { logger } from '~utils/logger.util';

/** Extra cloud attempts, with the same request key, before an unconfirmed outcome is reported. */
const RECONCILE_ATTEMPTS = 2;
const RECONCILE_DELAY_MS = 1_500;
const PENDING_TTL_MS = 10 * 60 * 1000;
const PENDING_KEY_PREFIX = 'genfeed-pending-fallback:';

const REASON_NOTICE: Readonly<Record<CloudFallbackReason, string>> = {
  credit_limit: 'has no credits left for this action',
  quota_exceeded: 'reached its request limit',
  service_unavailable: 'was unavailable',
};

const UNCONFIRMED_MESSAGE =
  'Genfeed did not confirm whether this finished. Nothing was sent to a local provider. Retry to check again.';

/** A failure the extension can offer a next step for. */
export class ActionRoutingError extends Error {
  constructor(
    message: string,
    readonly recovery: ActionRecovery,
  ) {
    super(message);
    this.name = 'ActionRoutingError';
  }
}

export interface RoutedResult<TResult> {
  result: TResult;
  /** Present only when a local provider wrote the result. */
  routing?: ActionRouting;
}

interface WorkspaceScope {
  brandId: string | null;
  organizationId: string;
  userId: string;
}

interface PendingFallback {
  reason: CloudFallbackReason;
  savedAt: number;
  scope: WorkspaceScope;
}

interface RoutedActionSpec<TRequest extends { requestKey: string }, TResult> {
  hostAction: NativeHostAction;
  /** Runs the action on Genfeed cloud with the request's key. */
  runCloud: (request: TRequest) => Promise<TResult>;
  readLocalResult: (response: NativeHostGeneratedResponse) => TResult;
  request: TRequest & { retry?: boolean };
}

function sameScope(a: WorkspaceScope, b: WorkspaceScope): boolean {
  return (
    a.userId === b.userId &&
    a.organizationId === b.organizationId &&
    a.brandId === b.brandId
  );
}

async function readFallbackProviderId(): Promise<NativeHostProviderIdValue | null> {
  const stored = (
    await chrome.storage.local.get(EXTENSION_SETTINGS_STORAGE_KEY)
  )[EXTENSION_SETTINGS_STORAGE_KEY] as
    | { localFallbackProviderId?: unknown }
    | undefined;
  const providerId = stored?.localFallbackProviderId;
  return isNativeHostProviderId(providerId) ? providerId : null;
}

async function readPending(
  requestKey: string,
  scope: WorkspaceScope,
): Promise<PendingFallback | null> {
  const key = `${PENDING_KEY_PREFIX}${requestKey}`;
  const pending = (await chrome.storage.session.get(key))[key] as
    | PendingFallback
    | undefined;
  if (
    !pending ||
    Date.now() - pending.savedAt > PENDING_TTL_MS ||
    !sameScope(pending.scope, scope)
  )
    return null;
  return pending;
}

async function writePending(
  requestKey: string,
  pending: PendingFallback,
): Promise<void> {
  await chrome.storage.session.set({
    [`${PENDING_KEY_PREFIX}${requestKey}`]: pending,
  });
}

async function clearPending(requestKey: string): Promise<void> {
  await chrome.storage.session.remove(`${PENDING_KEY_PREFIX}${requestKey}`);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeVoice(voice: LocalVoice): string {
  if (voice.source === 'none') {
    return 'no approved brand voice was applied';
  }
  return voice.source === 'cached' && voice.savedAt
    ? `using your approved brand voice as saved on ${voice.savedAt.slice(0, 10)}`
    : 'using your approved brand voice';
}

function buildRouting(
  providerId: NativeHostProviderIdValue,
  reason: CloudFallbackReason,
  voice: LocalVoice,
): ActionRouting {
  const providerLabel = NATIVE_HOST_PROVIDER_LABELS[providerId];
  return {
    hasBrandVoice: voice.snapshot !== null,
    notice: `Genfeed ${REASON_NOTICE[reason]}, so this was written locally with ${providerLabel}, ${describeVoice(voice)}.`,
    providerId,
    providerLabel,
    reason,
    voiceSource: voice.source,
  };
}

function hostRecovery(error: NativeHostError): ActionRecovery {
  const isRetryable =
    error.code !== 'provider_not_configured' &&
    error.code !== 'unsupported_platform' &&
    error.code !== 'invalid_request';
  return {
    canOpenProviderSettings: true,
    canRetry: isRetryable,
    kind: error.kind === 'unreachable' ? 'host_unreachable' : 'host_failed',
    retryTarget: isRetryable ? 'local' : null,
  };
}

async function runLocal<TRequest extends { requestKey: string }, TResult>(
  spec: RoutedActionSpec<TRequest, TResult>,
  providerId: NativeHostProviderIdValue | null,
  reason: CloudFallbackReason,
  scope: WorkspaceScope,
): Promise<RoutedResult<TResult>> {
  const requestKey = spec.request.requestKey;
  if (!providerId) {
    throw new ActionRoutingError(
      'Choose a local fallback provider in Settings, then retry.',
      {
        canOpenProviderSettings: true,
        canRetry: false,
        kind: 'host_failed',
        retryTarget: null,
      },
    );
  }
  // Recorded before the first local attempt: a retry after a host failure goes
  // to the host only and never back to Genfeed.
  await writePending(requestKey, { reason, savedAt: Date.now(), scope });
  const workspace = await requireWorkspace();
  try {
    const voice = await loadLocalVoice(workspace);
    const response = await runNativeHostAction({
      action: spec.hostAction,
      providerId,
      voice: voice.snapshot,
    });
    assertWorkspace(workspace);
    await clearPending(requestKey);
    return {
      result: spec.readLocalResult(response),
      routing: buildRouting(providerId, reason, voice),
    };
  } catch (error) {
    if (error instanceof NativeHostError) {
      throw new ActionRoutingError(error.message, hostRecovery(error));
    }
    if (error instanceof VoiceUnavailableError) {
      throw new ActionRoutingError(error.message, {
        canOpenProviderSettings: false,
        canRetry: true,
        kind: 'host_failed',
        retryTarget: 'local',
      });
    }
    // Sign-in, access or workspace trouble: recover it, do not retry blindly.
    await clearPending(requestKey);
    throw error;
  }
}

/**
 * Runs one text action cloud first. Only a confirmed cloud failure (service,
 * request limit, credits) hands the same action to the configured local
 * provider, with a routing notice. An unconfirmed outcome is reconciled with
 * the same request key and is never handed to another provider; sign-in,
 * access and workspace errors surface for recovery.
 */
export async function routeAction<
  TRequest extends { requestKey: string },
  TResult,
>(spec: RoutedActionSpec<TRequest, TResult>): Promise<RoutedResult<TResult>> {
  const workspace = await requireWorkspace();
  const scope: WorkspaceScope = {
    brandId: workspace.brandId,
    organizationId: workspace.organizationId,
    userId: workspace.userId,
  };
  const providerId = await readFallbackProviderId();

  if (spec.request.retry) {
    const pending = await readPending(spec.request.requestKey, scope);
    if (pending) return runLocal(spec, providerId, pending.reason, scope);
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await spec.runCloud(spec.request);
      await clearPending(spec.request.requestKey);
      if (providerId) {
        void refreshLocalVoiceCache(workspace).catch((error: unknown) =>
          logger.warn('Voice refresh failed', error),
        );
      }
      return { result };
    } catch (error) {
      const verdict = classifyCloudFailure(error);
      if (verdict.kind === 'fallback' && providerId) {
        return runLocal(spec, providerId, verdict.reason, scope);
      }
      if (verdict.kind !== 'uncertain') throw error;
      if (attempt >= RECONCILE_ATTEMPTS) {
        throw new ActionRoutingError(UNCONFIRMED_MESSAGE, {
          canOpenProviderSettings: false,
          canRetry: true,
          kind: 'cloud_unconfirmed',
          retryTarget: 'cloud',
        });
      }
      await wait(RECONCILE_DELAY_MS);
    }
  }
}

async function cloudService(): Promise<AgentToolsService> {
  const token = await authService.getToken();
  if (!token) throw new Error('Not authenticated');
  return new AgentToolsService(token);
}

export function routeTextAction(
  request: TextActionRequest & { retry?: boolean },
): Promise<RoutedResult<TextActionResult>> {
  return routeAction<TextActionRequest, TextActionResult>({
    hostAction: {
      action: 'refine_text',
      mode: request.mode,
      platform: request.platform,
      text: request.text,
    },
    readLocalResult: (response) => {
      if (response.action !== 'refine_text') {
        throw new NativeHostError('Unexpected answer from the host.', 'failed');
      }
      return response.result;
    },
    request,
    // Routing flags such as `retry` stay here; the cloud action gets its own fields only.
    runCloud: async ({ mode, platform, requestKey, text }) =>
      (await cloudService()).refineText({ mode, platform, requestKey, text }),
  });
}

export function routeReplyVariants(
  request: ReplyVariantsRequest & { retry?: boolean },
): Promise<RoutedResult<ReplyVariantsResult>> {
  return routeAction<ReplyVariantsRequest, ReplyVariantsResult>({
    hostAction: {
      action: 'generate_reply_variants',
      platform: request.platform,
      postAuthor: request.postAuthor?.slice(0, 200),
      postContent: request.postContent,
      tone: request.tone,
      variants: Math.min(
        request.variants ?? REPLY_VARIANTS_DEFAULT,
        REPLY_VARIANTS_MAX,
      ),
    },
    readLocalResult: (response) => {
      if (response.action !== 'generate_reply_variants') {
        throw new NativeHostError('Unexpected answer from the host.', 'failed');
      }
      return response.result;
    },
    request,
    runCloud: async ({
      platform,
      postAuthor,
      postContent,
      requestKey,
      tone,
      variants,
    }) =>
      (await cloudService()).generateReplyVariants({
        platform,
        postAuthor,
        postContent,
        requestKey,
        tone,
        variants,
      }),
  });
}
