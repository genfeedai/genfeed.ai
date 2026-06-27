/**
 * Analytics Export Service
 * CSV/XLSX export of published-post analytics. Owns the five platform-service
 * integrations used only for export. Extracted from AnalyticsService (#753).
 */
import { PostsService } from '@api/collections/posts/services/posts.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { CredentialPlatform, PublishStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

interface ExportPostData {
  id: string;
  label: string;
  description?: string;
  status: string;
  scheduledDate?: Date;
  publicationDate?: Date;
  tags?: string[];
  views?: number;
  isRepeat?: boolean;
  repeatFrequency?: string;
  repeatInterval?: number;
  repeatCount?: number;
  maxRepeats?: number;
  createdAt: Date;
  updatedAt: Date;
  externalId?: string;
  credential: {
    platform: CredentialPlatform;
  };
  ingredient: {
    metadata: string;
  };
  metadata?: {
    label?: string;
    description?: string;
    extension?: string;
    model?: string;
    style?: string;
  };
  organizationId: string;
  brandId: string;
}

interface ProcessedExportData {
  id: string;
  title: string;
  description?: string;
  status: string;
  platform: CredentialPlatform;
  scheduledDate?: Date;
  publicationDate?: Date;
  views: number;
  likes: number;
  comments: number;
  tags: string;
  videoLabel: string;
  videoDescription: string;
  extension: string;
  model: string;
  style: string;
  isRepeat?: boolean;
  repeatFrequency: string;
  repeatInterval: number;
  repeatCount: number;
  maxRepeats: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ExportRowData {
  [key: string]: string | number | Date | boolean | undefined;
}

interface PlatformStats {
  comments: number;
  likes: number;
  views: number;
}

@Injectable()
export class AnalyticsExportService {
  constructor(
    private readonly postsService: PostsService,
    private readonly youtubeService: YoutubeService,
    private readonly tiktokService: TiktokService,
    private readonly instagramService: InstagramService,
    private readonly pinterestService: PinterestService,
    private readonly twitterService: TwitterService,
    private readonly loggerService: LoggerService,
  ) {}

  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async exportData(
    format: 'csv' | 'xlsx',
    fields: string[],
    organizationId?: string,
  ): Promise<Buffer | string> {
    const data = await this.getExportData(organizationId);

    if (format === 'csv') {
      return this.generateCsv(data, fields);
    } else {
      return this.generateXlsx(data, fields);
    }
  }

  private async getExportData(
    organizationId?: string,
  ): Promise<ProcessedExportData[]> {
    // Build match stage with optional organization filter
    const matchStage: Record<string, unknown> = {
      status: PublishStatus.PUBLISHED,
    };
    if (organizationId) {
      matchStage.organization = organizationId;
    }

    const aggregate = { where: matchStage };

    const result = await this.postsService.findAll(aggregate, {
      pagination: false,
    });
    const docs = (result as unknown as { docs?: ExportPostData[] }).docs || [];

    // Batch fetch analytics by platform to avoid N+1 queries
    const statsMap = await this.batchFetchAnalytics(docs);

    const processedData: ProcessedExportData[] = docs.map((pub) => {
      const platform = pub.credential.platform;
      const stats = statsMap.get(pub.id) || {
        comments: 0,
        likes: 0,
        views: pub.views || 0,
      };

      return {
        comments: stats.comments,
        createdAt: pub.createdAt,
        description: pub.description,
        extension: pub.metadata?.extension || '',
        id: pub.id,
        isRepeat: pub.isRepeat,
        likes: stats.likes,
        maxRepeats: pub.maxRepeats || 0,
        model: pub.metadata?.model || '',
        platform: platform,
        publicationDate: pub.publicationDate,
        repeatCount: pub.repeatCount || 0,
        repeatFrequency: pub.repeatFrequency || '',
        repeatInterval: pub.repeatInterval || 0,
        scheduledDate: pub.scheduledDate,
        status: pub.status,
        style: pub.metadata?.style || '',
        tags: pub.tags?.join(',') || '',
        title: pub.label,
        updatedAt: pub.updatedAt,
        videoDescription: pub.metadata?.description || '',
        videoLabel: pub.metadata?.label || '',
        views: stats.views,
      };
    });

    return processedData;
  }

  /**
   * Batch fetch analytics by platform to avoid N+1 queries
   * Groups posts by platform and fetches in parallel with concurrency limit
   */
  private async batchFetchAnalytics(
    docs: ExportPostData[],
  ): Promise<Map<string, PlatformStats>> {
    const statsMap = new Map<string, PlatformStats>();

    // Group posts by platform
    const postsByPlatform = new Map<CredentialPlatform, ExportPostData[]>();
    for (const doc of docs) {
      if (!doc.externalId) {
        continue;
      }
      const platform = doc.credential.platform;
      if (!postsByPlatform.has(platform)) {
        postsByPlatform.set(platform, []);
      }
      postsByPlatform.get(platform)?.push(doc);
    }

    // Fetch analytics for each platform in parallel
    const platformPromises = Array.from(postsByPlatform.entries()).map(
      async ([platform, posts]) => {
        // Process posts for this platform with concurrency limit
        const BATCH_SIZE = 10;
        for (let i = 0; i < posts.length; i += BATCH_SIZE) {
          const batch = posts.slice(i, i + BATCH_SIZE);
          const batchPromises = batch.map(async (post) => {
            try {
              const stats = await this.fetchPlatformStats(
                platform,
                post.organizationId,
                post.brandId,
                post.externalId!,
              );
              statsMap.set(post.id, stats);
            } catch (error) {
              this.loggerService?.error('fetch stats failed', {
                error,
                externalId: post.externalId,
                platform,
              });
              statsMap.set(post.id, {
                comments: 0,
                likes: 0,
                views: post.views || 0,
              });
            }
          });
          await Promise.all(batchPromises);
        }
      },
    );

    await Promise.all(platformPromises);
    return statsMap;
  }

  /**
   * Fetch stats for a single post from the appropriate platform service
   */
  private fetchPlatformStats(
    platform: CredentialPlatform,
    organizationId: string,
    brandId: string,
    externalId: string,
  ): Promise<PlatformStats> {
    switch (platform) {
      case CredentialPlatform.YOUTUBE:
        return this.youtubeService.getMediaAnalytics(
          organizationId,
          brandId,
          externalId,
        );
      case CredentialPlatform.TIKTOK:
        return this.tiktokService.getMediaAnalytics(
          organizationId,
          brandId,
          externalId,
        );
      case CredentialPlatform.INSTAGRAM:
        return this.instagramService.getMediaAnalytics(
          organizationId,
          brandId,
          externalId,
        );
      case CredentialPlatform.TWITTER:
        return this.twitterService.getMediaAnalytics(externalId);
      case CredentialPlatform.PINTEREST:
        return this.pinterestService.getMediaAnalytics(
          organizationId,
          brandId,
          externalId,
        );
      default:
        return Promise.resolve({ comments: 0, likes: 0, views: 0 });
    }
  }

  private generateCsv(data: ProcessedExportData[], fields: string[]): string {
    if (data.length === 0) {
      return fields.join(',');
    }

    const headers = fields.join(',');
    const rows = data.map((item: ProcessedExportData) => {
      return fields
        .map((field) => {
          const value = item[field as keyof ProcessedExportData];
          if (value == null) {
            return '';
          }
          return this.escapeCsv(String(value));
        })
        .join(',');
    });

    return [headers, ...rows].join('\n');
  }

  private async generateXlsx(
    data: ProcessedExportData[],
    fields: string[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Export Data');

    // Add headers
    worksheet.columns = fields.map((field) => ({
      header: this.formatFieldName(field),
      key: field,
      width: 20,
    }));

    // Add data
    data.forEach((item) => {
      const row: ExportRowData = {};
      fields.forEach((field) => {
        row[field] = item[field as keyof ProcessedExportData];
      });
      worksheet.addRow(row);
    });

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      fgColor: { argb: 'FFE0E0E0' },
      pattern: 'solid',
      type: 'pattern',
    };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private formatFieldName(field: string): string {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  private escapeCsv(value: string): string {
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  @LogMethod({ level: 'log', logEnd: true, logError: true, logStart: true })
  public async exportVideoStatsCsv(): Promise<string> {
    const fields = ['videoLabel', 'views', 'comments', 'likes', 'platform'];
    return (await this.exportData('csv', fields)) as string;
  }
}
