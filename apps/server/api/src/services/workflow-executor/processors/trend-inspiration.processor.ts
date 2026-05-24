import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { type TrendingHashtagDocument } from '@api/collections/trends/schemas/trending-hashtag.schema';
import { type TrendingSoundDocument } from '@api/collections/trends/schemas/trending-sound.schema';
import { type TrendingVideoDocument } from '@api/collections/trends/schemas/trending-video.schema';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import {
  calculateEstimatedTextCredits,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { ActivitySource } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface TrendVideoInspirationInput {
  trendId?: string;
  auto?: boolean;
  platform: string;
  inspirationStyle: 'match_closely' | 'inspired_by' | 'remix_concept';
  includeOriginalHook: boolean;
  minViralScore: number;
}

export interface TrendVideoInspirationOutput {
  prompt: string;
  hashtags: string[];
  soundId: string | null;
  duration: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  style: string;
  sourceTrendTitle: string;
  sourceTrendUrl: string;
}

export interface TrendHashtagInspirationInput {
  hashtag?: string;
  auto?: boolean;
  platform: string;
  contentPreference: 'video' | 'image' | 'any';
}

export interface TrendHashtagInspirationOutput {
  prompt: string;
  hashtags: string[];
  contentType: 'video' | 'image' | 'carousel' | 'thread';
  recommendedPlatform: string;
  sourceHashtag: string;
  hashtagPostCount: number;
}

export interface TrendSoundInspirationInput {
  minUsageCount: number;
  maxDuration?: number;
}

export interface TrendSoundInspirationOutput {
  soundId: string;
  soundName: string;
  soundUrl: string;
  duration: number;
  usageCount: number;
  authorName: string | null;
  coverUrl: string | null;
  growthRate: number;
}

export interface TrendSummary {
  platform: string;
  topVideos: Array<{
    title: string;
    viralScore: number;
    url?: string;
  }>;
  topHashtags: Array<{
    hashtag: string;
    postCount: number;
  }>;
  topSounds: Array<{
    soundName: string;
    usageCount: number;
  }>;
  generatedAt: Date;
}

@Injectable()
export class TrendInspirationProcessor {
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly trendsService: TrendsService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
    private readonly organizationsService: OrganizationsService,
    private readonly replicateService: ReplicateService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Process TrendVideoInspiration node
   */
  async processVideoInspiration(
    input: TrendVideoInspirationInput,
    organizationId: string,
  ): Promise<TrendVideoInspirationOutput> {
    this.logger.log('Processing TrendVideoInspiration', {
      input,
      organizationId,
    });

    // Get viral videos from the specified platform
    const videos = await this.trendsService.getViralVideos({
      limit: 20,
      platform: input.platform,
    });

    if (videos.length === 0) {
      throw new Error(
        `No trending videos found for platform: ${input.platform}`,
      );
    }

    // Filter by minimum viral score
    const filteredVideos = videos.filter(
      (v: TrendingVideoDocument) => (v.viralScore ?? 0) >= input.minViralScore,
    );

    if (filteredVideos.length === 0) {
      throw new Error(
        `No videos found with viral score >= ${input.minViralScore}`,
      );
    }

    // Select video (by ID or top viral)
    let selectedVideo: TrendingVideoDocument = filteredVideos[0];
    if (input.trendId && !input.auto) {
      const found = filteredVideos.find(
        (v: TrendingVideoDocument) => v._id?.toString() === input.trendId,
      );
      if (found) {
        selectedVideo = found;
      }
    }

    // Generate AI prompt based on video
    const prompt = await this.generateVideoPrompt(
      selectedVideo,
      input,
      organizationId,
    );

    // Determine aspect ratio based on platform
    const aspectRatio = this.getAspectRatioForPlatform(input.platform);

    // Detect style from video metadata
    const style = this.detectVideoStyle(selectedVideo);

    return {
      aspectRatio,
      duration: selectedVideo.duration || 30,
      hashtags: selectedVideo.hashtags || [],
      prompt,
      soundId: selectedVideo.soundId || null,
      sourceTrendTitle: selectedVideo.title || 'Trending Video',
      sourceTrendUrl: selectedVideo.videoUrl || '',
      style,
    };
  }

  /**
   * Process TrendHashtagInspiration node
   */
  async processHashtagInspiration(
    input: TrendHashtagInspirationInput,
    organizationId: string,
  ): Promise<TrendHashtagInspirationOutput> {
    this.logger.log('Processing TrendHashtagInspiration', {
      input,
      organizationId,
    });

    // Get trending hashtags
    const hashtags = await this.trendsService.getTrendingHashtags({
      limit: 20,
      platform: input.platform,
    });

    if (hashtags.length === 0) {
      throw new Error(
        `No trending hashtags found for platform: ${input.platform}`,
      );
    }

    // Select hashtag (by name or top trending)
    let selectedHashtag: TrendingHashtagDocument = hashtags[0];
    if (input.hashtag && !input.auto) {
      const found = hashtags.find(
        (h: TrendingHashtagDocument) =>
          h.hashtag.toLowerCase() === input.hashtag?.toLowerCase() ||
          h.hashtag.toLowerCase() === `#${input.hashtag?.toLowerCase()}`,
      );
      if (found) {
        selectedHashtag = found;
      }
    }

    // Generate content prompt based on hashtag
    const prompt = await this.generateHashtagPrompt(
      selectedHashtag,
      input.contentPreference,
      organizationId,
    );

    // Determine content type based on preference and platform
    const contentType = this.getContentTypeForPreference(
      input.contentPreference,
      input.platform,
    );

    return {
      contentType,
      hashtagPostCount: selectedHashtag.postCount || 0,
      hashtags: [
        selectedHashtag.hashtag,
        ...(selectedHashtag.relatedHashtags || []).slice(0, 4),
      ],
      prompt,
      recommendedPlatform: input.platform,
      sourceHashtag: selectedHashtag.hashtag,
    };
  }

  /**
   * Process TrendSoundInspiration node
   */
  async processSoundInspiration(
    input: TrendSoundInspirationInput,
  ): Promise<TrendSoundInspirationOutput> {
    this.logger.log('Processing TrendSoundInspiration', { input });

    // Get trending sounds
    const sounds = await this.trendsService.getTrendingSounds({
      limit: 20,
    });

    if (sounds.length === 0) {
      throw new Error('No trending sounds found');
    }

    // Filter by minimum usage count
    let filteredSounds = sounds.filter(
      (s: TrendingSoundDocument) => (s.usageCount ?? 0) >= input.minUsageCount,
    );

    // Filter by max duration if specified
    if (input.maxDuration) {
      filteredSounds = filteredSounds.filter(
        (s: TrendingSoundDocument) =>
          !s.duration || s.duration <= input.maxDuration!,
      );
    }

    if (filteredSounds.length === 0) {
      throw new Error(
        `No sounds found with usage count >= ${input.minUsageCount}`,
      );
    }

    const selectedSound: TrendingSoundDocument = filteredSounds[0];

    return {
      authorName: selectedSound.authorName || null,
      coverUrl: selectedSound.coverUrl || null,
      duration: selectedSound.duration || 0,
      growthRate: selectedSound.growthRate || 0,
      soundId: selectedSound.soundId ?? selectedSound._id?.toString() ?? '',
      soundName: selectedSound.soundName ?? 'Unknown sound',
      soundUrl: selectedSound.playUrl || '',
      usageCount: selectedSound.usageCount ?? 0,
    };
  }

  /**
   * Generate a trend summary and send notifications to users
   */
  async sendTrendSummaryNotifications(
    _organizationId: string,
    userId: string,
  ): Promise<void> {
    // Get user settings
    const settings = await this.settingsService.findOne({
      isDeleted: false,
      user: userId,
    });

    if (!settings) {
      this.logger.warn('No settings found for user', { userId });
      return;
    }

    // Check if any notifications are enabled
    const shouldNotify =
      settings.isTrendNotificationsInApp ||
      settings.isTrendNotificationsTelegram ||
      settings.isTrendNotificationsEmail;

    if (!shouldNotify) {
      return;
    }

    // Generate trend summary
    const summary = await this.generateTrendSummary(
      settings.trendNotificationsMinViralScore || 70,
    );

    // Send notifications based on preferences
    if (
      settings.isTrendNotificationsTelegram &&
      settings.trendNotificationsTelegramChatId
    ) {
      await this.sendTelegramSummary(
        settings.trendNotificationsTelegramChatId,
        summary,
      );
    }

    if (
      settings.isTrendNotificationsEmail &&
      settings.trendNotificationsEmailAddress
    ) {
      await this.sendEmailSummary(
        settings.trendNotificationsEmailAddress,
        summary,
      );
    }

    this.logger.log('Trend summary notifications sent', {
      email: settings.isTrendNotificationsEmail,
      telegram: settings.isTrendNotificationsTelegram,
      userId,
    });
  }

  /**
   * Generate a comprehensive trend summary
   */
  private async generateTrendSummary(
    minViralScore: number,
  ): Promise<TrendSummary> {
    const [videos, hashtags, sounds] = await Promise.all([
      this.trendsService.getViralVideos({ limit: 10 }),
      this.trendsService.getTrendingHashtags({ limit: 10 }),
      this.trendsService.getTrendingSounds({ limit: 5 }),
    ]);

    return {
      generatedAt: new Date(),
      platform: 'all',
      topHashtags: hashtags.slice(0, 5).map((h: TrendingHashtagDocument) => ({
        hashtag: h.hashtag,
        postCount: h.postCount || 0,
      })),
      topSounds: sounds.slice(0, 5).map((s: TrendingSoundDocument) => ({
        soundName: s.soundName ?? 'Unknown sound',
        usageCount: s.usageCount ?? 0,
      })),
      topVideos: videos
        .filter(
          (v: TrendingVideoDocument) => (v.viralScore ?? 0) >= minViralScore,
        )
        .slice(0, 5)
        .map((v: TrendingVideoDocument) => ({
          title: v.title || 'Untitled',
          url: v.videoUrl,
          viralScore: v.viralScore ?? 0,
        })),
    };
  }

  /**
   * Send trend summary via Telegram
   */
  private async sendTelegramSummary(
    chatId: string,
    summary: TrendSummary,
  ): Promise<void> {
    const message = this.formatTrendSummaryForTelegram(summary);
    await this.notificationsService.sendTelegramMessage(chatId, message);
  }

  /**
   * Send trend summary via Email
   */
  private async sendEmailSummary(
    email: string,
    summary: TrendSummary,
  ): Promise<void> {
    const html = this.formatTrendSummaryForEmail(summary);
    await this.notificationsService.sendEmail(
      email,
      'Your Daily Trend Summary - Genfeed',
      html,
    );
  }

  /**
   * Format trend summary for Telegram
   */
  private formatTrendSummaryForTelegram(summary: TrendSummary): string {
    let message = '<b>Trend Summary</b>\n\n';

    if (summary.topVideos.length > 0) {
      message += '<b>Top Viral Videos:</b>\n';
      summary.topVideos.forEach((v, i) => {
        message += `${i + 1}. ${v.title} (Score: ${v.viralScore})\n`;
      });
      message += '\n';
    }

    if (summary.topHashtags.length > 0) {
      message += '<b>Trending Hashtags:</b>\n';
      summary.topHashtags.forEach((h) => {
        message += `#${h.hashtag.replace('#', '')} (${this.formatNumber(h.postCount)} posts)\n`;
      });
      message += '\n';
    }

    if (summary.topSounds.length > 0) {
      message += '<b>Trending Sounds:</b>\n';
      summary.topSounds.forEach((s) => {
        message += `${s.soundName} (${this.formatNumber(s.usageCount)} uses)\n`;
      });
    }

    return message;
  }

  /**
   * Format trend summary for Email
   */
  private formatTrendSummaryForEmail(summary: TrendSummary): string {
    return `
      <h2>Your Trend Summary</h2>
      <p>Here's what's trending right now:</p>

      ${
        summary.topVideos.length > 0
          ? `
        <h3>Top Viral Videos</h3>
        <ul>
          ${summary.topVideos.map((v) => `<li><strong>${v.title}</strong> - Viral Score: ${v.viralScore}</li>`).join('')}
        </ul>
      `
          : ''
      }

      ${
        summary.topHashtags.length > 0
          ? `
        <h3>Trending Hashtags</h3>
        <ul>
          ${summary.topHashtags.map((h) => `<li>#${h.hashtag.replace('#', '')} - ${this.formatNumber(h.postCount)} posts</li>`).join('')}
        </ul>
      `
          : ''
      }

      ${
        summary.topSounds.length > 0
          ? `
        <h3>Trending Sounds</h3>
        <ul>
          ${summary.topSounds.map((s) => `<li>${s.soundName} - ${this.formatNumber(s.usageCount)} uses</li>`).join('')}
        </ul>
      `
          : ''
      }

      <p style="color: #666; font-size: 12px;">
        Generated at ${summary.generatedAt.toLocaleString()}
      </p>
    `;
  }

  /**
   * Generate AI prompt based on trending video
   */
  private async generateVideoPrompt(
    video: TrendingVideoDocument,
    input: TrendVideoInspirationInput,
    organizationId: string,
  ): Promise<string> {
    const styleDescriptions: Record<string, string> = {
      inspired_by: 'Create unique content inspired by the concept',
      match_closely: 'Create similar content that closely matches the style',
      remix_concept: 'Take the core idea and remix it in a new direction',
    };

    const prompt = `Analyze this trending video and generate a content creation prompt:
- Title: ${video.title || 'N/A'}
- Description: ${video.description || 'N/A'}
- Hook: ${input.includeOriginalHook && video.hook ? video.hook : 'N/A'}
- Hashtags: ${(video.hashtags || []).join(', ')}
- Duration: ${video.duration || 30}s
- Platform: ${input.platform}
- Engagement Rate: ${video.engagementRate || 'N/A'}%

Style instruction: ${styleDescriptions[input.inspirationStyle]}

Generate a detailed prompt for creating AI video content that:
1. Captures the same attention-grabbing hook style
2. Matches the format and pacing
3. Is optimized for ${input.platform}
4. Can be generated with AI video tools

Return ONLY the prompt text, no explanations.`;
    const billingContext = await this.resolveBillingContext(organizationId);
    const replicateInput = {
      max_completion_tokens: 500,
      prompt,
    };

    await this.assertCreditsAvailable(billingContext.organizationId);

    const generatedPrompt =
      await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        replicateInput,
      );

    if (generatedPrompt) {
      await this.settleCredits(billingContext, replicateInput, generatedPrompt);
    }

    return (
      generatedPrompt ||
      `Create a ${input.platform} video inspired by trending content`
    );
  }

  /**
   * Generate content prompt based on trending hashtag
   */
  private async generateHashtagPrompt(
    hashtag: TrendingHashtagDocument,
    contentPreference: string,
    organizationId: string,
  ): Promise<string> {
    const prompt = `Generate a content idea for the trending hashtag #${hashtag.hashtag}:
- Post count: ${hashtag.postCount || 'many'} posts
- Related hashtags: ${(hashtag.relatedHashtags || []).slice(0, 5).join(', ')}
- Content type preference: ${contentPreference}

Create a specific, actionable content prompt that:
1. Leverages the hashtag's trending status
2. Would perform well on social media
3. Is suitable for ${contentPreference === 'any' ? 'any format' : `${contentPreference} content`}

Return ONLY the prompt text, no explanations.`;
    const billingContext = await this.resolveBillingContext(organizationId);
    const replicateInput = {
      max_completion_tokens: 300,
      prompt,
    };

    await this.assertCreditsAvailable(billingContext.organizationId);

    const generatedPrompt =
      await this.replicateService.generateTextCompletionSync(
        DEFAULT_TEXT_MODEL,
        replicateInput,
      );

    if (generatedPrompt) {
      await this.settleCredits(billingContext, replicateInput, generatedPrompt);
    }

    return generatedPrompt || `Create content featuring #${hashtag.hashtag}`;
  }

  /**
   * Get aspect ratio based on platform
   */
  private getAspectRatioForPlatform(platform: string): '16:9' | '9:16' | '1:1' {
    const platformRatios: Record<string, '16:9' | '9:16' | '1:1'> = {
      instagram: '1:1',
      reddit: '16:9',
      tiktok: '9:16',
      twitter: '16:9',
      youtube: '16:9',
    };
    return platformRatios[platform] || '16:9';
  }

  /**
   * Detect video style from metadata
   */
  private detectVideoStyle(video: TrendingVideoDocument): string {
    const title = (video.title || '').toLowerCase();
    const description = (video.description || '').toLowerCase();
    const combined = `${title} ${description}`;

    if (combined.includes('tutorial') || combined.includes('how to')) {
      return 'tutorial';
    }
    if (combined.includes('vlog') || combined.includes('day in')) {
      return 'vlog';
    }
    if (combined.includes('comedy') || combined.includes('funny')) {
      return 'comedy';
    }
    if (combined.includes('aesthetic') || combined.includes('satisfying')) {
      return 'aesthetic';
    }
    if (combined.includes('dance') || combined.includes('challenge')) {
      return 'trend_dance';
    }
    if (combined.includes('product') || combined.includes('review')) {
      return 'product';
    }
    if (combined.includes('story') || combined.includes('storytime')) {
      return 'storytelling';
    }

    return 'other';
  }

  /**
   * Get content type based on preference and platform
   */
  private getContentTypeForPreference(
    preference: string,
    platform: string,
  ): 'video' | 'image' | 'carousel' | 'thread' {
    if (preference === 'video') {
      return 'video';
    }
    if (preference === 'image') {
      return 'image';
    }

    // For 'any', suggest based on platform
    const platformDefaults: Record<
      string,
      'video' | 'image' | 'carousel' | 'thread'
    > = {
      instagram: 'carousel',
      reddit: 'image',
      tiktok: 'video',
      twitter: 'thread',
      youtube: 'video',
    };
    return platformDefaults[platform] || 'video';
  }

  private async resolveBillingContext(organizationId: string): Promise<{
    organizationId: string;
    userId: string;
  }> {
    const organization = await this.organizationsService.findOne({
      _id: organizationId,
    });

    const userId = organization?.user?.toString();
    if (!userId) {
      throw new Error(
        `Cannot resolve billing user for organization ${organizationId}`,
      );
    }

    return {
      organizationId,
      userId,
    };
  }

  private async assertCreditsAvailable(organizationId: string): Promise<void> {
    const model = await this.getDefaultTextModel();
    const requiredCredits = getMinimumTextCredits(model);
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );

    if (hasCredits) {
      return;
    }

    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );
    throw new InsufficientCreditsException(requiredCredits, currentBalance);
  }

  private async settleCredits(
    billingContext: { organizationId: string; userId: string },
    input: Record<string, unknown>,
    output: string,
  ): Promise<void> {
    const model = await this.getDefaultTextModel();
    const amount = calculateEstimatedTextCredits(model, input, output);
    if (amount <= 0) {
      return;
    }

    await this.creditsUtilsService.deductCreditsFromOrganization(
      billingContext.organizationId,
      billingContext.userId,
      amount,
      'Trend inspiration prompt generation',
      ActivitySource.SCRIPT,
      {
        maxOverdraftCredits:
          TrendInspirationProcessor.TEXT_MAX_OVERDRAFT_CREDITS,
      },
    );
  }

  private async getDefaultTextModel() {
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return model;
  }

  /**
   * Format number for display
   */
  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  }
}
