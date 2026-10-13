import { randomUUID } from 'node:crypto';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

/** The saved first tweet and the receipt that records how it was written. */
export interface OnboardingTweetDraft {
  postId: string;
  receiptId: string;
  /** `needs_review` means written from an unapproved (provisional) identity. */
  receiptState: string;
  requestKey: string;
  text: string;
}

type OnboardingContentDeps = {
  brandId: string;
  brandsService: {
    findOne: (query: Record<string, unknown>) => Promise<{
      description?: unknown;
      label?: unknown;
    } | null>;
  };
  checkOnboardingStatus: (
    ctx: ToolExecutionContext,
  ) => Promise<AgentToolResult>;
  ctx: ToolExecutionContext;
  direction: string;
  generateTweet: (input: {
    brandId: string;
    ctx: ToolExecutionContext;
    direction: string;
    previousRequestKey?: string;
  }) => Promise<OnboardingTweetDraft>;
  generateImage: (
    prompt: string,
    ctx: ToolExecutionContext,
  ) => Promise<AgentToolResult>;
  loggerService: LoggerService;
  organizationSettingsService?: {
    findOne: (query: Record<string, unknown>) => Promise<unknown>;
  };
  publishProgress: (data: {
    message: string;
    progress: number;
    threadId: string;
    toolName: string;
    userId: string;
  }) => Promise<void>;
  resolveProviderReadiness: (
    settings: {
      byokKeys?: unknown;
      isByokEnabled?: boolean;
    } | null,
  ) => { isImageReady: boolean };
  previousRequestKey?: string;
  retryTweet?: string;
};

export async function createOnboardingBrandDraft(
  deps: OnboardingContentDeps,
): Promise<AgentToolResult> {
  const { brandId, ctx, direction, previousRequestKey, retryTweet } = deps;
  try {
    if (isSelfHostedDeployment()) {
      const settings = await deps.organizationSettingsService?.findOne({
        organizationId: ctx.organizationId,
      });
      if (
        !deps.resolveProviderReadiness(
          (settings ?? null) as {
            byokKeys?: unknown;
            isByokEnabled?: boolean;
          } | null,
        ).isImageReady
      ) {
        return deps.checkOnboardingStatus(ctx);
      }
    }
    const brand = await deps.brandsService.findOne({
      id: brandId,
      isDeleted: false,
      organizationId: ctx.organizationId,
    });
    if (!brand) {
      return {
        creditsUsed: 0,
        error: 'This brand is unavailable in your workspace.',
        success: false,
      };
    }
    const brandName =
      typeof brand.label === 'string' ? brand.label : 'your brand';
    const description =
      typeof brand.description === 'string' ? brand.description : '';
    const reportProgress = async (message: string, progress: number) => {
      if (!ctx.threadId) return;
      try {
        await deps.publishProgress({
          message,
          progress,
          threadId: ctx.threadId,
          toolName: 'generate_onboarding_content',
          userId: ctx.userId,
        });
      } catch (error) {
        deps.loggerService.warn('Onboarding progress could not be published', {
          error,
        });
      }
    };
    let tweet = retryTweet;
    let draft: OnboardingTweetDraft | undefined;
    if (!tweet) {
      await reportProgress(`Writing a tweet for ${brandName}…`, 0.1);
      draft = await deps.generateTweet({
        brandId,
        ctx,
        direction,
        previousRequestKey,
      });
      tweet = draft.text.trim();
      if (!tweet) throw new Error('The text generator returned no draft.');
    }
    const isProvisional = draft ? draft.receiptState !== 'ready' : false;

    await reportProgress(`Creating an image for ${brandName}…`, 0.5);
    const image = await deps.generateImage(
      `Create one distinctive social image for ${brandName}. Brand context: ${description}. Illustrate this post: ${tweet}. Match the brand's subject and audience. ${direction ? `Requested creative direction: ${direction}.` : ''} Use a clear focal point and intentional composition. Avoid invented logos, text overlays, claims, and stock-photo cliches.`,
      { ...ctx, brandId },
    );
    const url =
      typeof image.data?.url === 'string' ? image.data.url : undefined;
    const images = url ? [url] : [];
    const isComplete = image.success && images.length > 0;
    return {
      creditsUsed: 0,
      data: {
        images,
        isComplete,
        message: `${
          isComplete
            ? `The image and tweet for ${brandName} are ready for review. Ask whether the user likes them; do not offer connection until approval.`
            : `The tweet is ready, but the image failed: ${image.error ?? 'Image unavailable'}. Keep the tweet visible. Do not claim the full draft is ready.`
        }${
          isProvisional
            ? ' The tweet is a provisional draft in the Genfeed default style until the user approves their own brand kit; say so plainly.'
            : ''
        } The image is not checked against the brand kit.`,
        tweets: [tweet],
        ...(draft
          ? {
              isProvisional,
              postId: draft.postId,
              receiptId: draft.receiptId,
              requestKey: draft.requestKey,
            }
          : {}),
      },
      isBillingDelegated: true,
      nextActions: [
        {
          brandId,
          ctas: [
            ...(isComplete
              ? [
                  {
                    action: 'send_prompt',
                    label: 'Looks good',
                    payload: {
                      prompt:
                        'I approve this image and tweet. Show me the optional X connection to publish it. Do not publish anything yet.',
                    },
                  },
                ]
              : []),
            {
              action: 'send_prompt',
              label: isComplete ? 'Try another version' : 'Retry image',
              payload: {
                prompt: isComplete
                  ? `Create another version of the image and tweet for my brand, with a different creative angle, using generate_onboarding_content${draft ? ` with previousRequestKey set to ${draft.requestKey}` : ''}. Show it for review before connecting an account.`
                  : `Retry only the image using generate_onboarding_content with retryTweet set to this exact tweet: ${tweet}`,
              },
            },
          ],
          description: `${
            isComplete
              ? 'Review your draft. Nothing has been published.'
              : `Your tweet is ready. ${image.error ?? 'The image could not be generated.'}`
          }${isProvisional ? ' Written in a provisional style until you approve your own brand kit.' : ''}`,
          data: draft
            ? {
                isProvisional,
                postId: draft.postId,
                receiptId: draft.receiptId,
                requestKey: draft.requestKey,
              }
            : undefined,
          id: `onboarding-content-${randomUUID()}`,
          images,
          platform: 'twitter',
          title: isComplete
            ? `Your first post for ${brandName}`
            : `Your tweet for ${brandName}`,
          tweets: [tweet],
          type: 'content_preview_card',
        },
      ],
      success: true,
    };
  } catch (error: unknown) {
    deps.loggerService.error('generateOnboardingContent failed', error);
    return {
      creditsUsed: 0,
      error:
        'We could not create your first post. Try again, or skip setup to open your workspace.',
      isBillingDelegated: true,
      success: false,
    };
  }
}
