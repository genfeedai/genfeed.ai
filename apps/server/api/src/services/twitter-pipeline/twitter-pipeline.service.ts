import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { toReplyBotCredentialData } from '@api/services/campaign/reply-bot-credential.util';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import {
  CredentialPlatform,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
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
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  buildTwitterDraftWorkflowDefinition,
  buildTwitterPublishWorkflowDefinition,
  buildTwitterSearchWorkflowDefinition,
  TWITTER_PIPELINE_ACTION_IDS,
} from './twitter-pipeline-workflow-definition';

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
    private readonly openRouterService: OpenRouterService,
    private readonly botActionExecutorService: BotActionExecutorService,
    private readonly credentialsService: CredentialsService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
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
   * Draft opportunities using Grok via OpenRouter
   * Builds a hybrid prompt from real tweet data
   */
  async draft(
    orgId: string,
    searchResults: ITwitterSearchResult[],
    voiceConfig: ITwitterVoiceConfig,
  ): Promise<ITwitterOpportunity[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const definition = buildTwitterDraftWorkflowDefinition();
      const { result: opportunities } =
        await this.systemWorkflowRunner.runWorkflow<ITwitterOpportunity[]>({
          actionType: definition.canonicalId,
          canonicalId: definition.canonicalId,
          inputValues: {
            request: {
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
    return {
      prompt: this.buildHybridPrompt(searchResults, voiceConfig),
      searchResults,
    };
  }

  private async executeDraftGenerationAction(
    input: Record<string, unknown>,
  ): Promise<{ rawContent: string }> {
    const draftContext = this.readRecord(input.draftContext);
    const response = await this.openRouterService.chatCompletion({
      max_tokens: 4000,
      messages: [
        {
          content: this.requiredString(draftContext.prompt, 'prompt'),
          role: 'user',
        },
      ],
      model: LLM_DEFAULTS.grokFast,
      temperature: 0.7,
    });
    return { rawContent: response.choices?.[0]?.message?.content ?? '' };
  }

  private async executeDraftParseAction(
    input: Record<string, unknown>,
  ): Promise<ITwitterOpportunity[]> {
    const draftContext = this.readRecord(input.draftContext);
    const generation = this.readRecord(input.generation);
    return this.parseOpportunities(
      this.requiredString(generation.rawContent, 'rawContent', true),
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
  private buildHybridPrompt(
    tweets: ITwitterSearchResult[],
    voiceConfig: ITwitterVoiceConfig,
  ): string {
    const tweetList = tweets
      .map(
        (t, i) =>
          `${i + 1}. @${t.authorUsername} (${t.likes} likes, ${t.retweets} RTs)\n   "${t.text}"\n   Tweet ID: ${t.id}`,
      )
      .join('\n\n');

    return `You are a Twitter/X engagement strategist. Below are ${tweets.length} REAL trending tweets found via the Twitter API.

For each tweet, suggest either a reply or a quote-tweet in the specified voice. Choose whichever would get more engagement.

Also generate 2 original tweet ideas inspired by the themes and trends you see in these tweets.

Voice: ${voiceConfig.description}

Account: ${voiceConfig.handle}

Here are the real tweets:

${tweetList}

Return your response as valid JSON with this exact structure:
{
  "opportunities": [
    {
      "type": "reply" or "quote",
      "tweetIndex": 1,
      "suggestedText": "your suggested response",
      "reason": "why this is worth engaging with"
    },
    {
      "type": "original",
      "suggestedText": "original tweet text",
      "reason": "why this would perform well based on current trends"
    }
  ]
}

Rules:
- For reply/quote entries, include "tweetIndex" (1-${tweets.length}) matching the tweet number above
- Generate exactly ${tweets.length} reply/quote suggestions (one per tweet) + 2 original ideas = ${tweets.length + 2} total
- Keep responses under 280 characters
- Be authentic to the voice, not generic or cringe

Return ONLY the JSON, no markdown fences, no extra text.`;
  }

  /**
   * Parse Grok response into typed opportunities,
   * enriching reply/quote entries with real tweet data
   */
  private parseOpportunities(
    rawContent: string,
    searchResults: ITwitterSearchResult[],
  ): ITwitterOpportunity[] {
    try {
      // Strip markdown fences if present
      const cleaned = rawContent
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(cleaned) as {
        opportunities?: Array<{
          type?: string;
          tweetIndex?: number;
          suggestedText?: string;
          reason?: string;
        }>;
      };

      if (!parsed.opportunities || !Array.isArray(parsed.opportunities)) {
        this.loggerService.warn(
          `${this.constructorName} parseOpportunities: no opportunities array`,
        );
        return [];
      }

      return parsed.opportunities.map((opp) => {
        const isEngagement = opp.type === 'reply' || opp.type === 'quote';
        const tweetIdx = (opp.tweetIndex ?? 0) - 1;
        const targetTweet =
          isEngagement && tweetIdx >= 0 && tweetIdx < searchResults.length
            ? searchResults[tweetIdx]
            : undefined;

        return {
          engagement: targetTweet
            ? { likes: targetTweet.likes, retweets: targetTweet.retweets }
            : undefined,
          reason: opp.reason ?? '',
          suggestedText: opp.suggestedText ?? '',
          targetAuthor: targetTweet?.authorUsername,
          targetTweet: targetTweet?.text,
          targetTweetId: targetTweet?.id,
          type: (opp.type as 'reply' | 'quote' | 'original') ?? 'original',
          verified: isEngagement && !!targetTweet,
        };
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} parseOpportunities failed to parse JSON`,
        error,
      );
      return [];
    }
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
