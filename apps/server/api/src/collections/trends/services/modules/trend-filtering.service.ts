import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type {
  TrendData,
  TrendPreferencesFilter,
} from '@api/collections/trends/interfaces/trend.interfaces';
import {
  Trend,
  type TrendDocument,
} from '@api/collections/trends/schemas/trend.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

@Injectable()
export class TrendFilteringService {
  constructor(
    @InjectModel(Trend.name, DB_CONNECTIONS.CLOUD)
    private trendModel: Model<TrendDocument>,
    readonly _loggerService: LoggerService,
  ) {}

  /**
   * Calculate virality score based on mentions, growth rate, and recency
   * Formula: (mentions x 0.5) + (growthRate x 0.3) + (recency x 0.2)
   */
  calculateViralityScore(trend: TrendData): number {
    // Normalize mentions (0-100 scale)
    // Assuming max mentions is 10M for normalization
    const normalizedMentions = Math.min((trend.mentions / 10000000) * 100, 100);

    // Growth rate is already 0-100 scale
    const growthRate = Math.min(trend.growthRate, 100);

    // Recency score (newer trends get higher score)
    // Decay from 100 → 0 over 30 minutes (typical trends TTL)
    const TTL_MINUTES = 30;
    const ageMs = trend.createdAt
      ? Date.now() - new Date(trend.createdAt).getTime()
      : 0;
    const ageMinutes = Math.max(0, ageMs / 60000);
    const recency = Math.max(0, 100 - (ageMinutes / TTL_MINUTES) * 100);

    const viralityScore =
      normalizedMentions * 0.5 + growthRate * 0.3 + recency * 0.2;

    return Math.round(Math.min(viralityScore, 100));
  }

  /**
   * Filter trends by brand description keywords
   */
  filterTrendsByBrandDescription(
    trends: TrendEntity[],
    brandDescription: string,
  ): TrendEntity[] {
    if (!brandDescription || !brandDescription.trim()) {
      return trends;
    }

    // Extract keywords from brand description (remove common words)
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'should',
      'could',
      'may',
      'might',
      'must',
      'can',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
    ]);

    const keywords = brandDescription
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !commonWords.has(word));

    if (keywords.length === 0) {
      return trends;
    }

    // Score trends by keyword matches
    const scoredTrends = trends.map((trend) => {
      const trendText = trend.topic.toLowerCase();
      let score = 0;

      for (const keyword of keywords) {
        if (trendText.includes(keyword)) {
          score += 1;
        }
      }

      return { score, trend };
    });

    // Sort by score (highest first), then by virality score
    scoredTrends.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.trend.viralityScore - a.trend.viralityScore;
    });

    // Return top-scored trends (at least show top 5 even if no matches)
    const matchingTrends = scoredTrends
      .filter((item) => item.score > 0)
      .map((item) => item.trend);

    // If we have matches, return them (up to original limit)
    // Otherwise return original trends sorted by virality
    if (matchingTrends.length > 0) {
      return matchingTrends.slice(0, trends.length);
    }

    return trends;
  }

  /**
   * Filter trends by preferences (keywords, categories, hashtags, platforms)
   */
  filterTrendsByPreferences(
    trends: TrendEntity[],
    preferences: TrendPreferencesFilter,
  ): TrendEntity[] {
    if (!preferences) {
      return trends;
    }

    const { keywords, categories, hashtags, platforms } = preferences;

    // If no preferences set, return all trends
    const hasAnyPreferences =
      (keywords && keywords.length > 0) ||
      (categories && categories.length > 0) ||
      (hashtags && hashtags.length > 0) ||
      (platforms && platforms.length > 0);

    if (!hasAnyPreferences) {
      return trends;
    }

    // Score trends by preference matches
    const scoredTrends = trends.map((trend) => {
      let score = 0;
      const trendText = trend.topic.toLowerCase();
      const trendHashtags = (trend.metadata?.hashtags || []).map((h: string) =>
        h.toLowerCase().replace('#', ''),
      );

      // Match keywords
      if (keywords && keywords.length > 0) {
        for (const keyword of keywords) {
          const keywordLower = keyword.toLowerCase();
          if (trendText.includes(keywordLower)) {
            score += 2; // Keywords are weighted higher
          }
        }
      }

      // Match categories (trend topic might contain category-related terms)
      if (categories && categories.length > 0) {
        for (const category of categories) {
          const categoryLower = category.toLowerCase();
          if (trendText.includes(categoryLower)) {
            score += 1;
          }
        }
      }

      // Match hashtags
      if (hashtags && hashtags.length > 0) {
        for (const hashtag of hashtags) {
          const hashtagClean = hashtag.toLowerCase().replace('#', '');
          if (trendHashtags.includes(hashtagClean)) {
            score += 3; // Exact hashtag match is highest priority
          } else if (trendText.includes(hashtagClean)) {
            score += 2;
          }
        }
      }

      // Filter by platform (if preferences specify platforms)
      if (platforms && platforms.length > 0) {
        if (!platforms.includes(trend.platform)) {
          score = -1; // Exclude trends from non-preferred platforms
        }
      }

      return { score, trend };
    });

    // Filter out excluded trends (score < 0), sort by score, then by virality
    const filteredScored = scoredTrends.filter((item) => item.score >= 0);
    filteredScored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.trend.viralityScore - a.trend.viralityScore;
    });

    const matchingTrends = filteredScored
      .filter((item) => item.score > 0)
      .map((item) => item.trend);

    // If we have matches, return them. Otherwise return top trends by virality
    if (matchingTrends.length > 0) {
      return matchingTrends.slice(0, trends.length);
    }

    // If platforms specified but no matches, return filtered by platform only
    if (platforms && platforms.length > 0) {
      return trends
        .filter((t) => platforms.includes(t.platform))
        .sort((a, b) => b.viralityScore - a.viralityScore)
        .slice(0, trends.length);
    }

    // Fallback: return original trends sorted by virality
    return trends;
  }

  /**
   * Get related trends (same topic, different platforms)
   */
  async getRelatedTrends(
    topic: string,
    excludePlatform: string,
    organizationId?: string,
    limit: number = 10,
  ): Promise<TrendEntity[]> {
    // Extract keywords from topic for matching
    const keywords = topic
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);

    if (keywords.length === 0) {
      return [];
    }

    // Build regex pattern for partial matching
    const regexPattern = keywords.map((k) => `(?=.*${k})`).join('');

    const query: Record<string, unknown> = {
      isCurrent: true,
      isDeleted: false,
      platform: { $ne: excludePlatform },
      topic: { $options: 'i', $regex: regexPattern },
    };

    if (organizationId) {
      query.$or = [
        { organization: new Types.ObjectId(organizationId) },
        { organization: null },
      ];
    } else {
      query.organization = null;
    }

    const relatedTrends = await this.trendModel
      .find(query)
      .sort({ viralityScore: -1 })
      .limit(limit)
      .lean();

    return relatedTrends.map((doc) => new TrendEntity(doc));
  }
}
