import type {
  BrandedPostsOutcomeV1,
  BrandedTextRunOutcomeV1,
  BrandedTextRunSpecV1,
  SocialContentRequestV1,
  TextActionFailureV1,
  ThreadRepliesRequestV1,
} from '@api/endpoints/ai-actions/branded-text-actions.types';
import { outputTokens } from '@api/endpoints/ai-actions/branded-text-output-tokens.util';
import { BrandedTextRunnerService } from '@api/endpoints/ai-actions/branded-text-runner.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { getChannelCapability } from '@genfeedai/contracts/api-types/contracts';
import {
  buildSocialContentPrompt,
  buildThreadRepliesPrompt,
} from '@genfeedai/helpers/content/text-action/branded-content-prompt.helper';
import {
  createReplyVariantsGate,
  splitReplyVariants,
} from '@genfeedai/helpers/content/text-action/reply-variants.helper';
import type { TextActionGate } from '@genfeedai/helpers/content/text-action/text-action-text.helper';
import { Injectable } from '@nestjs/common';

const DEFAULT_CHANNEL_LIMIT = 5000;
/** Posts a generated thread may hold; the prompt asks for three to seven. */
const MAX_THREAD_POSTS = 7;
const THREAD_REPLY_MAX_CHARACTERS = 280;
const POST_TEMPERATURE = 0.8;

const UNSUPPORTED_PLATFORM: TextActionFailureV1 = {
  kind: 'failed',
  code: 'unsupported_platform',
  message: 'This platform is not supported for text generation.',
};

const NO_USABLE_DRAFT: TextActionFailureV1 = {
  kind: 'failed',
  code: 'no_usable_draft',
  message: 'The model gave no usable draft. Try again.',
};

/**
 * The agent's post-writing tools: social `generate_content` (#5786) and
 * `draft_thread` replies. Each builds its prompt and answer gate and hands one
 * generation to the branded runner, so every proposal is written from the
 * brand, backed by a receipt and never produced by an unreceipted call.
 */
@Injectable()
export class BrandedContentActionsService {
  constructor(private readonly runner: BrandedTextRunnerService) {}

  /** Stand-alone posts, or one thread, for a topic on a social platform. */
  async generateSocial(
    request: SocialContentRequestV1,
  ): Promise<BrandedPostsOutcomeV1> {
    const capability = getChannelCapability(request.platform);
    if (!capability) return UNSUPPORTED_PLATFORM;
    const maxCharacters = capability.caption.maxLength ?? DEFAULT_CHANNEL_LIMIT;
    const maxPosts = request.isThread ? MAX_THREAD_POSTS : request.variants;
    return this.run({
      brandId: request.brandId,
      gate: createReplyVariantsGate({
        maxCharacters,
        maxVariants: maxPosts,
        usesWeightedCharacters:
          capability.platform === CredentialPlatform.TWITTER,
      }),
      label: request.isThread ? 'Agent thread' : 'Agent post',
      maxCharacters,
      maxTokens: outputTokens(maxCharacters * maxPosts),
      platform: capability.platform,
      request,
      spec: {
        knowledgeSourceIds: request.knowledgeSourceIds,
        knowledgeSpaceIds: request.knowledgeSpaceIds,
        prompt: buildSocialContentPrompt({
          additionalContext: request.additionalContext,
          isThread: request.isThread,
          maxCharacters,
          platformLabel: capability.label,
          topic: request.topic,
          variants: request.variants,
        }),
        sourceText: request.topic,
      },
    });
  }

  /** The replies that turn an existing X post into a thread. */
  async draftThreadReplies(
    request: ThreadRepliesRequestV1,
  ): Promise<BrandedPostsOutcomeV1> {
    const capability = getChannelCapability(CredentialPlatform.TWITTER);
    if (!capability) return UNSUPPORTED_PLATFORM;
    const replies = request.count - 1;
    return this.run({
      brandId: request.brandId,
      gate: createReplyVariantsGate({
        maxCharacters: THREAD_REPLY_MAX_CHARACTERS,
        maxVariants: replies,
        usesWeightedCharacters: true,
      }),
      label: 'Agent thread replies',
      maxCharacters: THREAD_REPLY_MAX_CHARACTERS,
      maxTokens: outputTokens(THREAD_REPLY_MAX_CHARACTERS * replies),
      platform: capability.platform,
      request,
      spec: {
        prompt: buildThreadRepliesPrompt({
          maxCharacters: THREAD_REPLY_MAX_CHARACTERS,
          originalContent: request.originalContent,
          platformLabel: capability.label,
          replies,
          tone: request.tone,
        }),
        sourceText: request.originalContent,
      },
    });
  }

  private async run(input: {
    brandId: string;
    gate: TextActionGate;
    label: string;
    maxCharacters: number;
    maxTokens: number;
    platform: CredentialPlatform;
    request: Pick<SocialContentRequestV1, 'actor' | 'requestKey'>;
    spec: Pick<
      BrandedTextRunSpecV1,
      'knowledgeSourceIds' | 'knowledgeSpaceIds' | 'prompt' | 'sourceText'
    >;
  }): Promise<BrandedPostsOutcomeV1> {
    const outcome: BrandedTextRunOutcomeV1 = await this.runner.run({
      ...input.spec,
      actor: input.request.actor,
      brandId: input.brandId,
      contentType: 'post',
      gate: input.gate,
      generation: {
        maxTokens: input.maxTokens,
        temperature: POST_TEMPERATURE,
      },
      label: input.label,
      platform: input.platform,
      requestKey: input.request.requestKey,
    });
    if (outcome.kind === 'rejected') {
      return { ...NO_USABLE_DRAFT, receiptId: outcome.receiptId };
    }
    if (outcome.kind === 'failed') return outcome;
    return {
      kind: 'completed',
      hasNewDispatch: outcome.hasNewDispatch,
      result: {
        maxCharacters: input.maxCharacters,
        platform: input.platform,
        posts: splitReplyVariants(outcome.text),
        postId: outcome.postId,
        receiptId: outcome.receiptId,
        receiptState: outcome.receiptState,
      },
    };
  }
}
