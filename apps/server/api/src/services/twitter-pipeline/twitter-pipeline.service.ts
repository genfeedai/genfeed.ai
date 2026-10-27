import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { isValidPostLength } from '@api/collections/posts/services/post-generation-text.util';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { toReplyBotCredentialData } from '@api/services/campaign/reply-bot-credential.util';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import {
  CredentialPlatform,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import {
  TWITTER_OPPORTUNITIES_SCHEMA_NAME,
  type TwitterOpportunities,
  twitterOpportunitiesSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type {
  IReplyBotCredentialData,
  ITwitterOpportunity,
  ITwitterPublishResult,
  ITwitterSearchResult,
  ITwitterVoiceConfig,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Injectable,
  type OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  buildTwitterDraftWorkflowDefinition,
  buildTwitterPublishWorkflowDefinition,
  buildTwitterSearchWorkflowDefinition,
  TWITTER_PIPELINE_ACTION_IDS,
} from './twitter-pipeline-workflow-definition';

export const TWITTER_DRAFT_BRAND_CONTEXT_UNAVAILABLE =
  'Brand context is unavailable for these drafts. Please retry.';

/** An X post, reply or quote is held to the standard 280 weighted characters. */
const TWITTER_DRAFT_MAX_CHARACTERS = 280;

/** Who asked for the drafts; brand access for the brief is checked for them. */
export type TwitterDraftCaller = Pick<
  AuthenticatedUser,
  'apiKeyId' | 'isApiKey' | 'scopes' | 'userId'
>;

type TwitterPublishRequest = {
  credentialId?: string;
  targetTweetId?: string;
  text: string;
  type: 'original' | 'quote' | 'reply' | 'repost';
};

@Injectable()
export class TwitterPipelineService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly twitterService: TwitterService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly botActionExecutorService: BotActionExecutorService,
    private readonly credentialsService: CredentialsService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    @Optional()
    private readonly harnessGenerationService?: HarnessGenerationService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      TWITTER_PIPELINE_ACTION_IDS.SEARCH_RECENT,
      ({ input }) => this.executeSearchAction(input),
    );
    this.systemWorkflowRunner.registerAction(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_BUILD_PROMPT,
      ({ input }) => this.executeDraftPromptAction(input),
    );
    this.systemWorkflowRunner.registerAction(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_GENERATE,
      ({ input }) => this.executeDraftGenerationAction(input),
    );
    this.systemWorkflowRunner.registerAction(
      TWITTER_PIPELINE_ACTION_IDS.DRAFT_PARSE,
      ({ input }) => this.executeDraftParseAction(input),
    );
    this.systemWorkflowRunner.registerAction(
      TWITTER_PIPELINE_ACTION_IDS.PUBLISH_RESOLVE_CREDENTIAL,
      ({ input }) => this.executeCredentialResolutionAction(input),
    );
    this.systemWorkflowRunner.registerAction(
      TWITTER_PIPELINE_ACTION_IDS.PUBLISH_SEND,
      ({ input }) => this.executePublishAction(input),
    );
  }

  private buildCredentialData(credential: {
    accessToken: string | null;
    accessTokenSecret: string | null;
    externalHandle: string | null;
    externalId: string | null;
    id: string;
    refreshToken: string | null;
  }): IReplyBotCredentialData | null {
    return toReplyBotCredentialData({
      accessToken: credential.accessToken ?? undefined,
      accessTokenSecret: credential.accessTokenSecret ?? undefined,
      externalHandle: credential.externalHandle ?? undefined,
      externalId: credential.externalId ?? undefined,
      id: credential.id,
      refreshToken: credential.refreshToken ?? undefined,
    });
  }

  /**
   * Search recent tweets using the bearer token client
   */
  async search(
    orgId: string,
    brandId: string,
    query: string,
    options: { maxResults?: number } = {},
  ): Promise<ITwitterSearchResult[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const definition = buildTwitterSearchWorkflowDefinition();
      const { result: results } = await this.systemWorkflowRunner.runWorkflow<
        ITwitterSearchResult[]
      >({
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: {
          request: {
            brandId,
            maxResults: options.maxResults ?? 10,
            organizationId: orgId,
            query,
          },
        },
        organizationId: orgId,
        source: 'TwitterPipelineService.search',
        trigger: WorkflowExecutionTrigger.API,
      });

      this.loggerService.log(`${url} returned ${results.length} tweets`, {
        brandId,
        orgId,
        query,
      });

      return results;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Draft opportunities using Grok through the LLM dispatcher
   * Builds a hybrid prompt from real tweet data
   */
  async draft(
    orgId: string,
    searchResults: ITwitterSearchResult[],
    voiceConfig: ITwitterVoiceConfig,
    brandId: string | undefined,
    caller: TwitterDraftCaller,
  ): Promise<ITwitterOpportunity[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    // Resolved here, where the caller is known, so brand access is checked
    // for them rather than for the workflow's system owner.
    const brandBrief = brandId
      ? await this.resolveDraftBrief(orgId, brandId, searchResults, caller)
      : null;

    try {
      const definition = buildTwitterDraftWorkflowDefinition();
      const { result: opportunities } =
        await this.systemWorkflowRunner.runWorkflow<ITwitterOpportunity[]>({
          actionType: definition.canonicalId,
          canonicalId: definition.canonicalId,
          inputValues: {
            request: {
              ...(brandId ? { brandId } : {}),
              ...(brandBrief ? { brandBrief } : {}),
              organizationId: orgId,
              searchResults,
              voiceConfig,
            },
          },
          organizationId: orgId,
          source: 'TwitterPipelineService.draft',
          trigger: WorkflowExecutionTrigger.API,
        });

      this.loggerService.log(
        `${url} generated ${opportunities.length} opportunities`,
        { orgId, voice: voiceConfig.handle },
      );

      return opportunities;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Publish a tweet (original, reply, quote, or native repost)
   */
  async publish(
    orgId: string,
    brandId: string,
    request: TwitterPublishRequest,
  ): Promise<ITwitterPublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const definition = buildTwitterPublishWorkflowDefinition();
      const { result } =
        await this.systemWorkflowRunner.runWorkflow<ITwitterPublishResult>({
          actionType: definition.canonicalId,
          canonicalId: definition.canonicalId,
          inputValues: {
            request: {
              brandId,
              ...(request.credentialId
                ? { credentialId: request.credentialId }
                : {}),
              organizationId: orgId,
              ...(request.targetTweetId
                ? { targetTweetId: request.targetTweetId }
                : {}),
              text: request.text,
              type: request.type,
            },
          },
          organizationId: orgId,
          source: 'TwitterPipelineService.publish',
          trigger: WorkflowExecutionTrigger.API,
        });

      return result;
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message ?? 'Unknown error';
      this.loggerService.error(`${url} failed`, { error: errorMessage });
      return { error: errorMessage, success: false };
    }
  }

  private async executeSearchAction(
    input: Record<string, unknown>,
  ): Promise<ITwitterSearchResult[]> {
    const request = this.readRequest(input);
    return this.twitterService.searchRecentTweets(
      this.requiredString(request.query, 'query'),
      {
        maxResults:
          typeof request.maxResults === 'number' ? request.maxResults : 10,
        sortOrder: 'relevancy',
      },
    );
  }

  private async executeDraftPromptAction(
    input: Record<string, unknown>,
  ): Promise<{
    prompt: string;
    searchResults: ITwitterSearchResult[];
  }> {
    const request = this.readRequest(input);
    const searchResults = this.readSearchResults(request.searchResults);
    const voiceConfig = this.readVoiceConfig(request.voiceConfig);
    const brief =
      typeof request.brandBrief === 'string' && request.brandBrief
        ? request.brandBrief
        : null;
    return {
      prompt: this.buildHybridPrompt(searchResults, voiceConfig, brief),
      searchResults,
    };
  }

  private async executeDraftGenerationAction(
    input: Record<string, unknown>,
  ): Promise<TwitterOpportunities> {
    const draftContext = this.readRecord(input.draftContext);
    return this.llmDispatcherService.completeStructured({
      max_tokens: 4000,
      messages: [
        {
          content: this.requiredString(draftContext.prompt, 'prompt'),
          role: 'user',
        },
      ],
      model: LLM_DEFAULTS.grokFast,
      schema: twitterOpportunitiesSchema,
      schemaName: TWITTER_OPPORTUNITIES_SCHEMA_NAME,
      temperature: 0.7,
    });
  }

  private async executeDraftParseAction(
    input: Record<string, unknown>,
  ): Promise<ITwitterOpportunity[]> {
    const draftContext = this.readRecord(input.draftContext);
    const generation = this.readRecord(input.generation);
    return this.enrichOpportunities(
      twitterOpportunitiesSchema
        .parse(generation)
        .opportunities.filter((opportunity) =>
          isValidPostLength(
            opportunity.suggestedText,
            TWITTER_DRAFT_MAX_CHARACTERS,
            true,
          ),
        ),
      this.readSearchResults(draftContext.searchResults),
    );
  }

  private async executeCredentialResolutionAction(
    input: Record<string, unknown>,
  ): Promise<{ credentialId: string }> {
    const request = this.readPublishRequest(input);
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId: request.brandId,
      credentialId: request.request.credentialId,
      organizationId: request.organizationId,
      platform: CredentialPlatform.TWITTER,
    });
    if (!credential) {
      throw new Error('Twitter credential not found');
    }
    if (!this.buildCredentialData(credential)) {
      throw new Error('Twitter credential missing accessToken');
    }
    return { credentialId: credential.id };
  }

  private async executePublishAction(
    input: Record<string, unknown>,
  ): Promise<ITwitterPublishResult> {
    const publish = this.readPublishRequest(input);
    const credentialInput = this.readRecord(input.credential);
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId: publish.brandId,
      credentialId: this.requiredString(
        credentialInput.credentialId,
        'credentialId',
      ),
      organizationId: publish.organizationId,
      platform: CredentialPlatform.TWITTER,
    });
    if (!credential) {
      return { error: 'Twitter credential not found', success: false };
    }

    const credentialData = this.buildCredentialData(credential);
    if (!credentialData) {
      return {
        error: 'Twitter credential missing accessToken',
        success: false,
      };
    }

    if (publish.request.type === 'original') {
      const result = await this.botActionExecutorService.postTweet(
        credentialData,
        publish.request.text,
      );
      return {
        ...(result.error ? { error: result.error } : {}),
        success: result.success,
        ...(result.contentId ? { tweetId: result.contentId } : {}),
        ...(result.contentUrl ? { tweetUrl: result.contentUrl } : {}),
      };
    }
    if (!publish.request.targetTweetId) {
      return {
        error: `targetTweetId required for ${publish.request.type}`,
        success: false,
      };
    }

    const result =
      publish.request.type === 'reply'
        ? await this.botActionExecutorService.postReply(
            credentialData,
            {
              authorId: '',
              authorUsername: '',
              createdAt: new Date(),
              id: publish.request.targetTweetId,
              text: '',
            },
            publish.request.text,
          )
        : publish.request.type === 'quote'
          ? await this.botActionExecutorService.postQuoteTweet(
              credentialData,
              publish.request.targetTweetId,
              publish.request.text,
            )
          : await this.botActionExecutorService.repostTweet(
              credentialData,
              publish.request.targetTweetId,
            );

    return {
      ...(result.error ? { error: result.error } : {}),
      success: result.success,
      ...(result.contentId ? { tweetId: result.contentId } : {}),
      ...(result.contentUrl ? { tweetUrl: result.contentUrl } : {}),
    };
  }

  /**
   * Build hybrid prompt from real tweet data (ported from scanner.js)
   */
  /**
   * With a brand, the drafts follow its composed harness brief (voice, X craft,
   * guardrails). An unresolved brief fails the request instead of letting
   * generic drafts through, like the other branded text generators.
   */
  private async resolveDraftBrief(
    organizationId: string,
    brandId: string,
    searchResults: ITwitterSearchResult[],
    caller: TwitterDraftCaller,
  ): Promise<string> {
    const harness = this.harnessGenerationService;
    const brief = harness
      ? await harness.resolveBrief({
          apiKeyId: caller.apiKeyId,
          brandId,
          isApiKey: caller.isApiKey,
          scopes: caller.scopes,
          userId: caller.userId,
          contentType: 'reply',
          includeContentMemory: true,
          objective: 'engagement',
          organizationId,
          platform: 'twitter',
          topic: searchResults[0]?.text.slice(0, 200),
        })
      : null;
    const formatted = harness?.formatBrief(brief).trim() ?? '';
    if (
      !brief ||
      !formatted ||
      formatted.length > BRAND_CONTEXT_CHARACTER_BUDGET
    ) {
      this.loggerService.error(
        `${this.constructorName} harness brief unavailable`,
        { brandId, organizationId },
      );
      throw new ServiceUnavailableException(
        TWITTER_DRAFT_BRAND_CONTEXT_UNAVAILABLE,
      );
    }
    return formatted;
  }

  private buildHybridPrompt(
    tweets: ITwitterSearchResult[],
    voiceConfig: ITwitterVoiceConfig,
    brief: string | null = null,
  ): string {
    const tweetList = tweets
      .map(
        (t, i) =>
          `${i + 1}. @${t.authorUsername} (${t.likes} likes, ${t.retweets} RTs)\n   "${t.text}"\n   Tweet ID: ${t.id}`,
      )
      .join('\n\n');

    return `You are a Twitter/X engagement strategist. Below are ${tweets.length} REAL trending tweets found via the Twitter API.

For each tweet where you have something specific to add, suggest either a reply or a quote-tweet in the specified voice. Choose whichever would get more engagement.

Also generate 2 original tweet ideas inspired by the themes and trends you see in these tweets.

Voice: ${voiceConfig.description}

Account: ${voiceConfig.handle}
${brief ? `\nBrand brief. Follow its voice, X craft and guardrails:\n${brief}\n` : ''}
Here are the real tweets:

${tweetList}

Rules:
- For reply/quote entries, set "tweetIndex" (1-${tweets.length}) matching the tweet number above; leave it out for original ideas
- Skip a tweet when you have nothing specific to add: never reply with agreement, praise, or a question that only asks for engagement
- Generate 2 original ideas, plus at most one reply/quote suggestion per tweet
- Keep responses under 280 characters
- Be authentic to the voice, not generic or cringe
- Say in "reason" why each one is worth posting`;
  }

  /**
   * Resolve each validated opportunity against the real search results, so a
   * reply or quote carries the tweet it answers. `verified` stays false when
   * the model pointed at a tweet index that is not in this batch.
   */
  private enrichOpportunities(
    opportunities: TwitterOpportunities['opportunities'],
    searchResults: ITwitterSearchResult[],
  ): ITwitterOpportunity[] {
    return opportunities.map((opportunity) => {
      const isEngagement =
        opportunity.type === 'reply' || opportunity.type === 'quote';
      const tweetIndex = (opportunity.tweetIndex ?? 0) - 1;
      const targetTweet =
        isEngagement && tweetIndex >= 0 && tweetIndex < searchResults.length
          ? searchResults[tweetIndex]
          : undefined;

      return {
        engagement: targetTweet
          ? { likes: targetTweet.likes, retweets: targetTweet.retweets }
          : undefined,
        reason: opportunity.reason,
        suggestedText: opportunity.suggestedText,
        targetAuthor: targetTweet?.authorUsername,
        targetTweet: targetTweet?.text,
        targetTweetId: targetTweet?.id,
        type: opportunity.type,
        verified: isEngagement && Boolean(targetTweet),
      };
    });
  }

  private readPublishRequest(input: Record<string, unknown>): {
    brandId: string;
    organizationId: string;
    request: TwitterPublishRequest;
  } {
    const request = this.readRequest(input);
    const type = request.type;
    if (
      type !== 'original' &&
      type !== 'quote' &&
      type !== 'reply' &&
      type !== 'repost'
    ) {
      throw new Error(`Unsupported X publish type: ${String(type)}`);
    }
    return {
      brandId: this.requiredString(request.brandId, 'brandId'),
      organizationId: this.requiredString(
        request.organizationId,
        'organizationId',
      ),
      request: {
        ...(typeof request.credentialId === 'string'
          ? { credentialId: request.credentialId }
          : {}),
        ...(typeof request.targetTweetId === 'string'
          ? { targetTweetId: request.targetTweetId }
          : {}),
        text: this.requiredString(request.text, 'text', true),
        type,
      },
    };
  }

  private readRequest(input: Record<string, unknown>): Record<string, unknown> {
    const request = this.readRecord(input.request);
    return Object.keys(request).length > 0 ? request : input;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readSearchResults(value: unknown): ITwitterSearchResult[] {
    if (!Array.isArray(value)) {
      throw new Error('X draft action requires searchResults');
    }
    return value as ITwitterSearchResult[];
  }

  private readVoiceConfig(value: unknown): ITwitterVoiceConfig {
    const record = this.readRecord(value);
    return {
      description: this.requiredString(record.description, 'description'),
      handle: this.requiredString(record.handle, 'handle'),
      searchQuery: this.requiredString(record.searchQuery, 'searchQuery', true),
    };
  }

  private requiredString(
    value: unknown,
    field: string,
    allowEmpty = false,
  ): string {
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
      throw new Error(`X pipeline action requires ${field}`);
    }
    return value;
  }
}
