import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  ITwitterOpportunity,
  ITwitterPublishResult,
  ITwitterSearchResult,
  ITwitterVoiceConfig,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TwitterPipelineService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly twitterService: TwitterService,
    private readonly openRouterService: OpenRouterService,
    private readonly botActionExecutorService: BotActionExecutorService,
    private readonly credentialsService: CredentialsService,
  ) {}

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
      const results = await this.twitterService.searchRecentTweets(query, {
        maxResults: options.maxResults ?? 10,
        sortOrder: 'relevancy',
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
      const prompt = this.buildHybridPrompt(searchResults, voiceConfig);

      const response = await this.openRouterService.chatCompletion({
        max_tokens: 4000,
        messages: [{ content: prompt, role: 'user' }],
        model: 'x-ai/grok-4.1-fast',
        temperature: 0.7,
      });

      const content = response.choices?.[0]?.message?.content ?? '';
      const opportunities = this.parseOpportunities(content, searchResults);

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
   * Publish a tweet (original, reply, or quote)
   */
  async publish(
    orgId: string,
    brandId: string,
    request: {
      type: 'reply' | 'quote' | 'original';
      text: string;
      targetTweetId?: string;
    },
  ): Promise<ITwitterPublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.findOne({
        brand: brandId,
        isDeleted: false,
        organization: orgId,
        platform: CredentialPlatform.TWITTER,
      });

      if (!credential) {
        return { error: 'Twitter credential not found', success: false };
      }

      const credentialData = {
        accessToken: credential.accessToken,
        accessTokenSecret: credential.accessTokenSecret,
        externalId: credential.externalId,
        refreshToken: credential.refreshToken,
        username: credential.externalHandle,
      };

      switch (request.type) {
        case 'reply': {
          if (!request.targetTweetId) {
            return {
              error: 'targetTweetId required for reply',
              success: false,
            };
          }
          const replyResult = await this.botActionExecutorService.postReply(
            credentialData,
            {
              authorId: '',
              authorUsername: '',
              createdAt: new Date(),
              id: request.targetTweetId,
              text: '',
            },
            request.text,
          );
          return {
            error: replyResult.error,
            success: replyResult.success,
            tweetId: replyResult.contentId,
            tweetUrl: replyResult.contentUrl,
          };
        }

        case 'quote': {
          if (!request.targetTweetId) {
            return {
              error: 'targetTweetId required for quote',
              success: false,
            };
          }
          const quoteResult =
            await this.botActionExecutorService.postQuoteTweet(
              credentialData,
              request.targetTweetId,
              request.text,
            );
          return {
            error: quoteResult.error,
            success: quoteResult.success,
            tweetId: quoteResult.contentId,
            tweetUrl: quoteResult.contentUrl,
          };
        }

        case 'original': {
          const tweetResult = await this.botActionExecutorService.postTweet(
            credentialData,
            request.text,
          );
          return {
            error: tweetResult.error,
            success: tweetResult.success,
            tweetId: tweetResult.contentId,
            tweetUrl: tweetResult.contentUrl,
          };
        }

        default:
          return {
            error: `Unknown publish type: ${request.type}`,
            success: false,
          };
      }
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message ?? 'Unknown error';
      this.loggerService.error(`${url} failed`, { error: errorMessage });
      return { error: errorMessage, success: false };
    }
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
}
