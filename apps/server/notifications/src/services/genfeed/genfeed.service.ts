import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import axios, { type AxiosInstance } from 'axios';

export interface GenerateResponseOptions {
  prompt: string;
  type?: 'chat' | 'tweet' | 'prompt';
  tone?: string;
  length?: string;
  metadata?: Record<string, unknown>;
}

export interface TweetReplyOptions {
  tweetContent: string;
  tweetAuthor?: string;
  tweetUrl?: string;
  tone?:
    | 'professional'
    | 'casual'
    | 'friendly'
    | 'humorous'
    | 'supportive'
    | 'informative'
    | 'witty'
    | 'engaging';
  length?: 'short' | 'medium' | 'long';
  tagGrok?: boolean;
}

@Injectable()
export class GenFeedService {
  private readonly apiClient: AxiosInstance;
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    this.apiUrl =
      this.configService.get('GENFEEDAI_API_URL') || 'https://api.genfeed.ai';
    this.apiKey = this.configService.get('GENFEEDAI_API_KEY') || '';

    this.apiClient = axios.create({
      baseURL: this.apiUrl,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  public async generateResponse(
    options: GenerateResponseOptions,
  ): Promise<string> {
    const url = `${this.constructor.name} generateResponse`;
    try {
      this.loggerService.log(`${url} started`, { type: options.type });

      const isTweet = options.type === 'tweet';
      const endpoint = isTweet ? '/prompts/tweet' : '/prompts';

      const requestBody = isTweet
        ? {
            length: options.metadata?.length || 'medium',
            tone: options.metadata?.tone || 'friendly',
            tweetContent: options.prompt,
            ...options.metadata,
          }
        : {
            original: options.prompt,
            type: options.type || 'chat',
          };

      const response = await this.apiClient.post(endpoint, requestBody);

      const result = isTweet
        ? response.data.reply
        : response.data.enhanced || response.data.result || response.data.text;

      this.loggerService.log(`${url} completed`, {
        resultLength: result?.length,
        type: options.type,
      });

      return result || '';
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      // Fallback to basic response if API fails
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        throw new Error(
          'Genfeed API authentication failed. Please check your API key.',
        );
      }

      throw error;
    }
  }

  public async generateTweetReply(options: TweetReplyOptions): Promise<string> {
    const url = `${this.constructor.name} generateTweetReply`;
    try {
      this.loggerService.log(`${url} started`, {
        tone: options.tone,
        tweetLength: options.tweetContent.length,
      });

      const response = await this.apiClient.post('/prompts/tweet', {
        length: options.length || 'medium',
        tagGrok: options.tagGrok || false,
        tone: options.tone || 'friendly',
        tweetAuthor: options.tweetAuthor,
        tweetContent: options.tweetContent,
        tweetUrl: options.tweetUrl,
      });

      const reply = response.data.reply;

      this.loggerService.log(`${url} completed`, {
        replyLength: reply?.length,
      });

      return reply || '';
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  public async enhancePrompt(
    prompt: string,
    type: string = 'video',
  ): Promise<string> {
    const url = `${this.constructor.name} enhancePrompt`;
    try {
      this.loggerService.log(`${url} started`, { type });

      const response = await this.apiClient.post('/prompts', {
        original: prompt,
        type,
      });

      const enhanced = response.data.enhanced || response.data.result;

      this.loggerService.log(`${url} completed`, {
        enhancedLength: enhanced?.length,
        originalLength: prompt.length,
      });

      return enhanced || prompt;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return prompt; // Return original if enhancement fails
    }
  }

  public async checkHealth(): Promise<boolean> {
    const url = `${this.constructor.name} checkHealth`;
    try {
      const response = await this.apiClient.get('/v1/health');
      return response.status === 200;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return false;
    }
  }
}
