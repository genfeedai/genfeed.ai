import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import { CreativePattern } from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PatternType } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';

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

type AdPerformanceData = {
  headlineText?: string;
  bodyText?: string;
  ctaText?: string;
  adPlatform?: string;
  industry?: string;
  performanceScore?: number;
};

type ContentPerformanceData = {
  hookUsed?: string;
  promptUsed?: string;
  platform?: string;
  performanceScore?: number;
};

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
    private readonly prisma: PrismaService,
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
      // Query high-performing ad records
      const adRecords = await this.prisma.adPerformance.findMany({
        where: { isDeleted: false },
      });

      // Query high-performing content records
      const contentRecords = await this.prisma.contentPerformance.findMany({
        where: { isDeleted: false },
      });

      // Filter in-memory for performance score and platform
      const filteredAds = adRecords.filter((r) => {
        const d = (r.data as AdPerformanceData) ?? {};
        const score = d.performanceScore ?? 0;
        if (score < 80) return false;
        if (platform !== 'all' && d.adPlatform !== platform) return false;
        return true;
      });

      const filteredContent = contentRecords.filter((r) => {
        const d = (r.data as ContentPerformanceData) ?? {};
        const score = d.performanceScore ?? 0;
        if (score < 80) return false;
        if (platform !== 'all' && d.platform !== platform) return false;
        return true;
      });

      this.logger.log(
        `${this.constructorName} found ${filteredAds.length} ad records and ${filteredContent.length} content records`,
      );

      const classified: ClassifiedRecord[] = [];

      // Classify ad records
      for (const ad of filteredAds) {
        const d = (ad.data as AdPerformanceData) ?? {};
        const orgId = ad.organizationId;
        const adPlatform = d.adPlatform || platform;
        const score = d.performanceScore ?? 0;

        if (d.headlineText) {
          classified.push({
            classifiedType: classifyHook(d.headlineText),
            industry: d.industry,
            orgId,
            patternType: 'hook_formula',
            platform: adPlatform,
            score,
            source: 'ad',
            text: d.headlineText,
          });
        }

        if (d.ctaText) {
          classified.push({
            classifiedType: classifyCta(d.ctaText),
            industry: d.industry,
            orgId,
            patternType: 'cta_formula',
            platform: adPlatform,
            score,
            source: 'ad',
            text: d.ctaText,
          });
        }

        if (d.bodyText) {
          classified.push({
            classifiedType: classifyContentStructure(d.bodyText),
            industry: d.industry,
            orgId,
            patternType: 'content_structure',
            platform: adPlatform,
            score,
            source: 'ad',
            text: d.bodyText,
          });
        }
      }

      // Classify content performance records
      for (const content of filteredContent) {
        const d = (content.data as ContentPerformanceData) ?? {};
        const orgId = content.organizationId;
        const contentPlatform = d.platform || platform;
        const score = d.performanceScore ?? 0;

        if (d.hookUsed) {
          classified.push({
            classifiedType: classifyHook(d.hookUsed),
            orgId,
            patternType: 'hook_formula',
            platform: contentPlatform,
            score,
            source: 'organic',
            text: d.hookUsed,
          });
        }

        if (d.promptUsed) {
          classified.push({
            classifiedType: classifyContentStructure(d.promptUsed),
            orgId,
            patternType: 'content_structure',
            platform: contentPlatform,
            score,
            source: 'organic',
            text: d.promptUsed,
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
            organization: singleOrgId as never,
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
