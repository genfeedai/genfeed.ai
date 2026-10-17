import type {
  ReplyVariantsOutcomeV1,
  ReplyVariantsRequestV1,
  TextActionFailureV1,
  TextActionOutcomeV1,
  TextActionRequestV1,
} from '@api/endpoints/ai-actions/branded-text-actions.types';
import { outputTokens } from '@api/endpoints/ai-actions/branded-text-output-tokens.util';
import { BrandedTextRunnerService } from '@api/endpoints/ai-actions/branded-text-runner.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts';
import { REPLY_MAX_CHARACTERS } from '@genfeedai/contracts/constants';
import {
  createReplyVariantsGate,
  splitReplyVariants,
} from '@genfeedai/helpers/content/text-action/reply-variants.helper';
import { buildReplyVariantsPrompt } from '@genfeedai/helpers/content/text-action/reply-variants-prompt.helper';
import { buildTextActionPrompt } from '@genfeedai/helpers/content/text-action/text-action-prompt.helper';
import {
  createTextActionGate,
  resolveTextActionLimit,
} from '@genfeedai/helpers/content/text-action/text-action-text.helper';
import { Injectable } from '@nestjs/common';

const DEFAULT_CHANNEL_LIMIT = 5000;
/** Room a single reply needs in the answer, whatever the platform allows. */
const REPLY_TOKEN_CEILING_CHARACTERS = 1000;

const UNSUPPORTED_PLATFORM: TextActionFailureV1 = {
  kind: 'failed',
  code: 'unsupported_platform',
  message: 'This platform is not supported for text actions.',
};

/**
 * The text actions of the browser extension: proofread or rewrite the user's
 * own draft (#4343) and draft reply options to a post (#4342). Each builds its
 * prompt and answer gate and hands one generation to the branded runner.
 */
@Injectable()
export class BrandedTextActionsService {
  constructor(private readonly runner: BrandedTextRunnerService) {}

  async run(request: TextActionRequestV1): Promise<TextActionOutcomeV1> {
    const capability = getChannelCapability(request.platform);
    if (!capability) return UNSUPPORTED_PLATFORM;
    const usesWeightedCharacters =
      capability.platform === CredentialPlatform.TWITTER;
    const maxCharacters = resolveTextActionLimit({
      channelLimit: capability.caption.maxLength ?? DEFAULT_CHANNEL_LIMIT,
      mode: request.mode,
      source: request.text,
      usesWeightedCharacters,
    });
    const gate = createTextActionGate({
      maxCharacters,
      mode: request.mode,
      source: request.text,
      usesWeightedCharacters,
    });

    const outcome = await this.runner.run({
      actor: request.actor,
      brandId: request.brandId,
      contentType: 'post',
      gate,
      generation: {
        maxTokens: outputTokens(maxCharacters),
        temperature: request.mode === 'proofread' ? 0.2 : 0.7,
      },
      label:
        request.mode === 'proofread'
          ? 'Extension proofread'
          : 'Extension rewrite',
      platform: capability.platform,
      prompt: buildTextActionPrompt({
        hasBrandVoice: true,
        maxCharacters,
        mode: request.mode,
        platformLabel: capability.label,
        text: request.text,
      }),
      requestKey: request.requestKey,
      sourceText: request.text,
    });

    if (outcome.kind === 'rejected') {
      const isDroppedToken = gate.rejection() === 'tokens';
      return {
        kind: 'failed',
        code: isDroppedToken ? 'text_changed_meaning' : 'limit_exceeded',
        message: isDroppedToken
          ? 'The edit dropped or changed a mention, hashtag or link. Try again.'
          : `The result did not fit the ${maxCharacters}-character limit. Try again.`,
        hasNewDispatch: outcome.hasNewDispatch,
        receiptId: outcome.receiptId,
      };
    }
    if (outcome.kind === 'failed') return outcome;
    return {
      kind: 'completed',
      hasNewDispatch: outcome.hasNewDispatch,
      result: {
        hasBrandVoice: true,
        isReplayed: outcome.isReplayed,
        maxCharacters,
        mode: request.mode,
        platform: request.platform,
        receiptId: outcome.receiptId,
        receiptState: outcome.receiptState,
        text: outcome.text,
      },
    };
  }

  async draftReplyVariants(
    request: ReplyVariantsRequestV1,
  ): Promise<ReplyVariantsOutcomeV1> {
    const capability = getChannelCapability(request.platform);
    if (!capability) return UNSUPPORTED_PLATFORM;
    const maxCharacters =
      REPLY_MAX_CHARACTERS[request.platform] ??
      capability.caption.maxLength ??
      DEFAULT_CHANNEL_LIMIT;
    const gate = createReplyVariantsGate({
      maxCharacters,
      maxVariants: request.variants,
      usesWeightedCharacters:
        capability.platform === CredentialPlatform.TWITTER,
    });

    const outcome = await this.runner.run({
      actor: request.actor,
      brandId: request.brandId,
      contentType: 'reply',
      gate,
      generation: {
        maxTokens: outputTokens(
          request.variants *
            Math.min(maxCharacters, REPLY_TOKEN_CEILING_CHARACTERS),
        ),
        temperature: 0.9,
      },
      label: 'Extension reply options',
      platform: capability.platform,
      prompt: buildReplyVariantsPrompt({
        hasBrandVoice: true,
        maxCharacters,
        platformLabel: capability.label,
        postAuthor: request.postAuthor,
        postContent: request.postContent,
        tone: request.tone,
        variants: request.variants,
      }),
      requestKey: request.requestKey,
      sourceText: request.postContent,
    });

    if (outcome.kind === 'rejected') {
      return {
        kind: 'failed',
        code: 'no_usable_reply',
        message: 'The model gave no usable reply. Try again.',
        hasNewDispatch: outcome.hasNewDispatch,
        receiptId: outcome.receiptId,
      };
    }
    if (outcome.kind === 'failed') return outcome;
    return {
      kind: 'completed',
      hasNewDispatch: outcome.hasNewDispatch,
      result: {
        hasBrandVoice: true,
        isReplayed: outcome.isReplayed,
        maxCharacters,
        platform: request.platform,
        receiptId: outcome.receiptId,
        receiptState: outcome.receiptState,
        tone: request.tone,
        variants: splitReplyVariants(outcome.text),
      },
    };
  }
}
