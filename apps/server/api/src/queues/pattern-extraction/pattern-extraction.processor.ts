import {
  AdPerformance,
  type AdPerformanceDocument,
} from '@api/collections/ad-performance/schemas/ad-performance.schema';
import {
  ContentPerformance,
  type ContentPerformanceDocument,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { CreativePattern } from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import type { PatternType } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bullmq';
import { type Model, Types } from 'mongoose';

export interface PatternExtractionJobData {
  platform: string; // 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'google_ads' | 'all'
}

interface ClassifiedRecord {
  text: string;
  score: number;
  platform: string;
  orgId: string;
  industry?: string;
  source: 'ad' | 'organic';
  classifiedType: string;
  patternType: PatternType;
}

const MIN_ORGS_FOR_PUBLIC = 5;

function classifyHook(text: string): string {
  if (
    /^(Did|Do|Does|Are|Is|Can|Will|Have|Why|What|How|When|Where)\b/i.test(text)
  ) {
    return 'question_hook';
  }
  if (/\d+%|\d+x|\d+ times/i.test(text)) {
    return 'stat_hook';
  }
  if (/stop|warning|never|always|secret|truth|mistake/i.test(text)) {
    return 'pattern_interrupt_hook';
  }
  if (/before.*after|transform|went from/i.test(text)) {
    return 'transformation_hook';
  }
  return 'narrative_hook';
}

function classifyCta(text: string): string {
  if (/^(Buy|Get|Start|Try|Shop|Order|Claim|Grab|Download|Sign)/i.test(text)) {
    return 'command_cta';
  }
  if (/limited|ends|today only|last chance|hurry|now/i.test(text)) {
    return 'urgency_cta';
  }
  if (/free|no cost|no charge/i.test(text)) {
    return 'free_offer_cta';
  }
  if (text.trim().endsWith('?')) {
    return 'question_cta';
  }
  return 'soft_cta';
}

function classifyContentStructure(text: string): string {
  if (/^\d+\.|1\.|first/i.test(text)) {
    return 'list_structure';
  }
  if (text.includes('?') && text.length > 20) {
    return 'qa_structure';
  }
  if (text.length < 50) {
    return 'punchy_structure';
  }
  if (text.length > 280) {
    return 'story_structure';
  }
  return 'standard_structure';
}

@Injectable()
@Processor('pattern-extraction')
export class PatternExtractionProcessor extends WorkerHost {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(AdPerformance.name, DB_CONNECTIONS.CLOUD)
    private readonly adPerformanceModel: Model<AdPerformanceDocument>,
    @InjectModel(ContentPerformance.name, DB_CONNECTIONS.CLOUD)
    private readonly contentPerformanceModel: Model<ContentPerformanceDocument>,
    private readonly creativePatternsService: CreativePatternsService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<PatternExtractionJobData>): Promise<void> {
    const { platform } = job.data;

    this.logger.log(
      `${this.constructorName} processing pattern extraction for platform: ${platform}`,
    );

    try {
      const platformFilter = platform === 'all' ? {} : { adPlatform: platform };
      const contentPlatformFilter =
        platform === 'all' ? {} : { platform: platform };

      // Query high-performing ad records
      const adQuery: Record<string, unknown> = {
        ...platformFilter,
        isDeleted: false,
        performanceScore: { $gte: 80 },
      };

      // Query high-performing content records
      const contentQuery: Record<string, unknown> = {
        ...contentPlatformFilter,
        isDeleted: false,
        performanceScore: { $gte: 80 },
      };

      const [adRecords, contentRecords] = await Promise.all([
        this.adPerformanceModel
          .find(adQuery)
          .select(
            'headlineText bodyText ctaText adPlatform industry organization performanceScore',
          )
          .lean()
          .exec(),
        this.contentPerformanceModel
          .find(contentQuery)
          .select('hookUsed promptUsed platform organization performanceScore')
          .lean()
          .exec(),
      ]);

      this.logger.log(
        `${this.constructorName} found ${adRecords.length} ad records and ${contentRecords.length} content records`,
      );

      const classified: ClassifiedRecord[] = [];

      // Classify ad records
      for (const ad of adRecords) {
        const orgId = String(ad.organization);
        const adPlatform = ad.adPlatform || platform;

        if (ad.headlineText) {
          classified.push({
            classifiedType: classifyHook(ad.headlineText),
            industry: ad.industry,
            orgId,
            patternType: 'hook_formula',
            platform: adPlatform,
            score: ad.performanceScore,
            source: 'ad',
            text: ad.headlineText,
          });
        }

        if (ad.ctaText) {
          classified.push({
            classifiedType: classifyCta(ad.ctaText),
            industry: ad.industry,
            orgId,
            patternType: 'cta_formula',
            platform: adPlatform,
            score: ad.performanceScore,
            source: 'ad',
            text: ad.ctaText,
          });
        }

        if (ad.bodyText) {
          classified.push({
            classifiedType: classifyContentStructure(ad.bodyText),
            industry: ad.industry,
            orgId,
            patternType: 'content_structure',
            platform: adPlatform,
            score: ad.performanceScore,
            source: 'ad',
            text: ad.bodyText,
          });
        }
      }

      // Classify content performance records
      for (const content of contentRecords) {
        const orgId = String(content.organization);
        const contentPlatform = content.platform || platform;

        if (content.hookUsed) {
          classified.push({
            classifiedType: classifyHook(content.hookUsed),
            orgId,
            patternType: 'hook_formula',
            platform: contentPlatform,
            score: content.performanceScore,
            source: 'organic',
            text: content.hookUsed,
          });
        }

        if (content.promptUsed) {
          classified.push({
            classifiedType: classifyContentStructure(content.promptUsed),
            orgId,
            patternType: 'content_structure',
            platform: contentPlatform,
            score: content.performanceScore,
            source: 'organic',
            text: content.promptUsed,
          });
        }
      }

      // Group by (platform, industry, classifiedType, patternType)
      const groups = new Map<string, ClassifiedRecord[]>();
      for (const record of classified) {
        const key = `${record.platform}|${record.industry ?? ''}|${record.classifiedType}|${record.patternType}`;
        const group = groups.get(key) ?? [];
        group.push(record);
        groups.set(key, group);
      }

      const now = new Date();
      const publicValidUntil = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      const privateValidUntil = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      );

      let upsertedCount = 0;

      for (const [key, records] of groups.entries()) {
        const [recordPlatform, industry, classifiedType, patternType] =
          key.split('|');

        // Group by org to check k-anonymity and handle private patterns
        const orgGroups = new Map<string, ClassifiedRecord[]>();
        for (const record of records) {
          const orgRecords = orgGroups.get(record.orgId) ?? [];
          orgRecords.push(record);
          orgGroups.set(record.orgId, orgRecords);
        }

        const distinctOrgCount = orgGroups.size;

        // Upsert public pattern if k-anonymity threshold met
        if (distinctOrgCount >= MIN_ORGS_FOR_PUBLIC) {
          const sortedByScore = [...records].sort((a, b) => b.score - a.score);
          const topExamples = sortedByScore.slice(0, 3).map((r) => ({
            platform: r.platform,
            score: r.score,
            source: r.source,
            text: r.text,
          }));
          const avgScore =
            records.reduce((sum, r) => sum + r.score, 0) / records.length;

          const patternData: Partial<CreativePattern> = {
            avgPerformanceScore: Math.round(avgScore),
            computedAt: now,
            description: `High-performing ${classifiedType.replace(/_/g, ' ')} pattern`,
            examples: topExamples,
            formula: classifiedType,
            industry: industry || undefined,
            isDeleted: false,
            label: classifiedType.replace(/_/g, ' '),
            patternType: patternType as PatternType,
            platform: recordPlatform || undefined,
            sampleSize: records.length,
            scope: 'public',
            source: 'both',
            validUntil: publicValidUntil,
          };

          try {
            await this.creativePatternsService.upsertPattern(patternData);
            upsertedCount++;
          } catch (error: unknown) {
            this.logger.error(
              `${this.constructorName} failed to upsert public pattern: ${key}`,
              (error as Error).message,
            );
          }
        }

        // Upsert private patterns for each org with single-org data
        if (distinctOrgCount === 1) {
          const [singleOrgId, orgRecords] = [...orgGroups.entries()][0];
          const sortedByScore = [...orgRecords].sort(
            (a, b) => b.score - a.score,
          );
          const topExamples = sortedByScore.slice(0, 3).map((r) => ({
            platform: r.platform,
            score: r.score,
            source: r.source,
            text: r.text,
          }));
          const avgScore =
            orgRecords.reduce((sum, r) => sum + r.score, 0) / orgRecords.length;

          const patternData: Partial<CreativePattern> = {
            avgPerformanceScore: Math.round(avgScore),
            computedAt: now,
            description: `Private high-performing ${classifiedType.replace(/_/g, ' ')} pattern`,
            examples: topExamples,
            formula: classifiedType,
            industry: industry || undefined,
            isDeleted: false,
            label: classifiedType.replace(/_/g, ' '),
            organization: new Types.ObjectId(singleOrgId),
            patternType: patternType as PatternType,
            platform: recordPlatform || undefined,
            sampleSize: orgRecords.length,
            scope: 'private',
            source: orgRecords[0].source,
            validUntil: privateValidUntil,
          };

          try {
            await this.creativePatternsService.upsertPattern(patternData);
            upsertedCount++;
          } catch (error: unknown) {
            this.logger.error(
              `${this.constructorName} failed to upsert private pattern: ${key}`,
              (error as Error).message,
            );
          }
        }
      }

      await job.updateProgress(100);
      this.logger.log(
        `${this.constructorName} pattern extraction completed. Upserted ${upsertedCount} patterns`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} pattern extraction failed`,
        (error as Error).message,
      );
      throw error;
    }
  }
}
