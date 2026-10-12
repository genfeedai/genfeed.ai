import { CredentialPlatform } from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import type {
  NativeHostAction,
  NativeHostGeneratedResponse,
  NativeHostGenerateRequest,
} from '@genfeedai/contracts/api-types/contracts/native-host.contract';
import { NO_BRAND_VOICE_HINT, REPLY_MAX_CHARACTERS } from '@genfeedai/contracts/constants';
import {
  createReplyVariantsGate,
  splitReplyVariants,
} from '@genfeedai/helpers/content/text-action/reply-variants.helper';
import { buildReplyVariantsPrompt } from '@genfeedai/helpers/content/text-action/reply-variants-prompt.helper';
import { buildTextActionPrompt } from '@genfeedai/helpers/content/text-action/text-action-prompt.helper';
import {
  createTextActionGate,
  resolveTextActionLimit,
  type TextActionGate,
} from '@genfeedai/helpers/content/text-action/text-action-text.helper';
import { type FetchLike, runApiProvider } from './api-providers';
import { findProvider, isApiProvider } from './catalog';
import { buildCliInvocation } from './cli-providers';
import { runCli, withScratchDirectory } from './cli-runner';
import type { HostConfig } from './config';
import { type DetectionEnvironment, resolveCliExecutable } from './detect';
import { HostFailure } from './failure';
import { renderVoiceContext } from './voice-context';

/** Channel limit used when a platform publishes none; the cloud action uses the same. */
const DEFAULT_CHANNEL_LIMIT = 5_000;

export interface GenerateDependencies {
  abortSignal?: AbortSignal;
  config: HostConfig;
  env: NodeJS.ProcessEnv;
  environment: DetectionEnvironment;
  fetchImpl: FetchLike;
  timeoutMs: number;
}

interface ActionPlan {
  gate: TextActionGate;
  maxCharacters: number;
  /** The task prompt without voice context. */
  prompt: string;
  rejectionMessage: () => string;
}

const UNSUPPORTED_PLATFORM = new HostFailure(
  'unsupported_platform',
  'This platform is not supported for text actions.'
);

function planAction(action: NativeHostAction, hasBrandVoice: boolean): ActionPlan {
  const capability = getChannelCapability(action.platform);
  if (!capability) throw UNSUPPORTED_PLATFORM;
  const usesWeightedCharacters = capability.platform === CredentialPlatform.TWITTER;

  if (action.action === 'refine_text') {
    const maxCharacters = resolveTextActionLimit({
      channelLimit: capability.caption.maxLength ?? DEFAULT_CHANNEL_LIMIT,
      mode: action.mode,
      source: action.text,
      usesWeightedCharacters,
    });
    const gate = createTextActionGate({
      maxCharacters,
      mode: action.mode,
      source: action.text,
      usesWeightedCharacters,
    });
    return {
      gate,
      maxCharacters,
      prompt: buildTextActionPrompt({
        hasBrandVoice,
        maxCharacters,
        mode: action.mode,
        platformLabel: capability.label,
        text: action.text,
      }),
      rejectionMessage: () =>
        gate.rejection() === 'tokens'
          ? 'The edit dropped or changed a mention, hashtag or link. Try again.'
          : `The result did not fit the ${maxCharacters}-character limit. Try again.`,
    };
  }

  const maxCharacters =
    REPLY_MAX_CHARACTERS[action.platform] ?? capability.caption.maxLength ?? DEFAULT_CHANNEL_LIMIT;
  return {
    gate: createReplyVariantsGate({
      maxCharacters,
      maxVariants: action.variants,
      usesWeightedCharacters,
    }),
    maxCharacters,
    prompt: buildReplyVariantsPrompt({
      hasBrandVoice,
      maxCharacters,
      platformLabel: capability.label,
      postAuthor: action.postAuthor,
      postContent: action.postContent,
      tone: action.tone,
      variants: action.variants,
    }),
    rejectionMessage: () => 'The model gave no usable reply. Try again.',
  };
}

async function runProvider(
  request: NativeHostGenerateRequest,
  prompt: string,
  dependencies: GenerateDependencies
): Promise<string> {
  const provider = findProvider(request.providerId);
  if (isApiProvider(provider)) {
    const config = dependencies.config.providers[provider.id];
    if (!config) {
      throw new HostFailure(
        'provider_not_configured',
        `${provider.label} is not configured. Run \`gf host provider add ${provider.id}\`.`
      );
    }
    return runApiProvider({
      abortSignal: dependencies.abortSignal,
      config,
      fetchImpl: dependencies.fetchImpl,
      prompt,
      providerId: provider.id,
      timeoutMs: dependencies.timeoutMs,
    });
  }

  const executablePath = await resolveCliExecutable(provider, dependencies.environment);
  if (!executablePath) {
    throw new HostFailure(
      'provider_unavailable',
      `${provider.label} was not found. Install it, then run \`gf host install\` again.`
    );
  }
  return withScratchDirectory(async (scratchDirectory) => {
    const invocation = buildCliInvocation(provider, scratchDirectory);
    return runCli({
      abortSignal: dependencies.abortSignal,
      args: invocation.args,
      env: { ...dependencies.env, CI: '1', NO_COLOR: '1' },
      executablePath,
      outputFile: invocation.outputFile,
      prompt,
      timeoutMs: dependencies.timeoutMs,
      workingDirectory: scratchDirectory,
    });
  });
}

/**
 * Runs one text action on the chosen local provider and returns the result in
 * the shape the cloud action returns. The prompt and the answer gate are the
 * cloud's own; the approved brand voice, when sent, is added as data.
 */
export async function generateText(
  request: NativeHostGenerateRequest,
  dependencies: GenerateDependencies
): Promise<NativeHostGeneratedResponse> {
  const { action, voice } = request;
  const hasBrandVoice = voice !== null;
  const plan = planAction(action, hasBrandVoice);
  const voiceContext = voice
    ? renderVoiceContext(voice, action.action === 'refine_text' ? action.mode : 'reply')
    : null;
  const prompt = voiceContext ? `${voiceContext}\n\n${plan.prompt}` : plan.prompt;

  const answer = plan.gate.normalize(await runProvider(request, prompt, dependencies));
  if (answer === null) throw new HostFailure('output_rejected', plan.rejectionMessage());

  const voiceFields = {
    hasBrandVoice,
    isReplayed: false as const,
    maxCharacters: plan.maxCharacters,
    platform: action.platform,
    ...(hasBrandVoice ? {} : { voiceHint: NO_BRAND_VOICE_HINT }),
  };
  if (action.action === 'refine_text') {
    return {
      action: 'refine_text',
      providerId: request.providerId,
      requestId: request.requestId,
      result: { ...voiceFields, mode: action.mode, text: answer },
      type: 'generated',
      version: request.version,
    };
  }
  return {
    action: 'generate_reply_variants',
    providerId: request.providerId,
    requestId: request.requestId,
    result: { ...voiceFields, tone: action.tone, variants: splitReplyVariants(answer) },
    type: 'generated',
    version: request.version,
  };
}
