import {
  TrendPreferences,
  type TrendPreferencesDocument,
} from '@api/collections/trends/schemas/trend-preferences.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';

@Injectable()
export class TrendPreferencesService {
  constructor(
    @InjectModel(TrendPreferences.name, DB_CONNECTIONS.CLOUD)
    private trendPreferencesModel: Model<TrendPreferencesDocument>,
    private readonly loggerService: LoggerService,
  ) {}

  async getPreferences(
    organizationId: string,
    brandId?: string,
  ): Promise<TrendPreferencesDocument | null> {
    try {
      const preferences = await this.trendPreferencesModel.findOne(
        this.buildQuery(organizationId, brandId),
      );

      // If no brand-specific preferences, try organization-level
      if (!preferences && brandId) {
        return await this.trendPreferencesModel.findOne(
          this.buildQuery(organizationId),
        );
      }

      return preferences;
    } catch (error: unknown) {
      this.loggerService.error('Failed to get trend preferences', error);
      return null;
    }
  }

  async savePreferences(
    organizationId: string,
    preferences: {
      brandId?: string;
      categories?: string[];
      keywords?: string[];
      platforms?: string[];
      hashtags?: string[];
    },
  ): Promise<TrendPreferencesDocument> {
    try {
      const existing = await this.trendPreferencesModel.findOne(
        this.buildQuery(organizationId, preferences.brandId),
      );

      const updateData = {
        categories: preferences.categories || [],
        hashtags: preferences.hashtags || [],
        keywords: preferences.keywords || [],
        platforms: preferences.platforms || [],
        updatedAt: new Date(),
      };

      if (existing) {
        // Update existing preferences
        existing.categories = updateData.categories;
        existing.keywords = updateData.keywords;
        existing.platforms = updateData.platforms;
        existing.hashtags = updateData.hashtags;
        (existing as unknown).updatedAt = updateData.updatedAt;
        return await existing.save();
      } else {
        // Create new preferences
        const newPreferences = new this.trendPreferencesModel({
          brand: this.toBrandObjectId(preferences.brandId),
          organization: new Types.ObjectId(organizationId),
          ...updateData,
        });
        return await newPreferences.save();
      }
    } catch (error: unknown) {
      this.loggerService.error('Failed to save trend preferences', error);
      throw error;
    }
  }

  private buildQuery(
    organizationId: string,
    brandId?: string,
  ): FilterQuery<TrendPreferencesDocument> {
    return {
      brand: this.toBrandObjectId(brandId),
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
    };
  }

  private toBrandObjectId(brandId?: string): Types.ObjectId | null {
    return brandId ? new Types.ObjectId(brandId) : null;
  }
}
