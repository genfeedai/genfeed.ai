import { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  PersonaContentFormat,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException } from '@nestjs/common';

export interface ContentPlanInput {
  personaId: Types.ObjectId;
  organization: Types.ObjectId;
  user: Types.ObjectId;
  brand: Types.ObjectId;
  days: number;
  credentialId?: Types.ObjectId;
}

export interface ContentPlanEntry {
  scheduledDate: Date;
  format: PersonaContentFormat;
  topic: string;
  description: string;
  category: PostCategory;
}

export interface ContentPlanResult {
  entries: ContentPlanEntry[];
  totalPosts: number;
}

const FORMAT_TO_CATEGORY: Record<PersonaContentFormat, PostCategory> = {
  [PersonaContentFormat.PHOTO]: PostCategory.IMAGE,
  [PersonaContentFormat.VIDEO]: PostCategory.VIDEO,
  [PersonaContentFormat.REEL]: PostCategory.REEL,
  [PersonaContentFormat.STORY]: PostCategory.STORY,
  [PersonaContentFormat.ARTICLE]: PostCategory.ARTICLE,
  [PersonaContentFormat.AUDIO]: PostCategory.POST,
  [PersonaContentFormat.TEXT]: PostCategory.TEXT,
};

@Injectable()
export class PersonaContentPlanService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly personasService: PersonasService,
    private readonly postsService: PostsService,
  ) {}

  async generateContentPlan(
    input: ContentPlanInput,
  ): Promise<ContentPlanResult> {
    const caller = CallerUtil.getCallerName();
    const persona = await this.getPersonaOrFail(
      input.personaId,
      input.organization,
    );

    const strategy = persona.contentStrategy;
    const topics = strategy?.topics ?? ['general'];
    const formats = strategy?.formats ?? [PersonaContentFormat.PHOTO];
    const frequency = this.parseFrequency(strategy?.frequency);

    const entries: ContentPlanEntry[] = [];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(10, 0, 0, 0);

    const currentDate = new Date(startDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + input.days);

    let topicIndex = 0;
    let formatIndex = 0;

    while (currentDate < endDate) {
      const topic = topics[topicIndex % topics.length];
      const format = formats[formatIndex % formats.length];
      const category = FORMAT_TO_CATEGORY[format] ?? PostCategory.POST;

      entries.push({
        category,
        description: `${format} content about ${topic} for ${persona.label}`,
        format,
        scheduledDate: new Date(currentDate),
        topic,
      });

      topicIndex++;
      formatIndex++;
      currentDate.setDate(currentDate.getDate() + frequency);
    }

    this.loggerService.log(
      `${this.constructorName} ${caller} - Generated ${entries.length} content plan entries for persona ${persona.label}`,
    );

    return {
      entries,
      totalPosts: entries.length,
    };
  }

  async createDraftPosts(
    input: ContentPlanInput,
    entries: ContentPlanEntry[],
  ): Promise<number> {
    const caller = CallerUtil.getCallerName();
    let created = 0;

    for (const entry of entries) {
      try {
        await this.postsService.create({
          brand: input.brand,
          category: entry.category,
          credential: input.credentialId as Types.ObjectId,
          description: entry.description,
          label: `${entry.topic} - ${entry.format}`,
          organization: input.organization,
          persona: input.personaId,
          scheduledDate: entry.scheduledDate,
          status: PostStatus.DRAFT,
          user: input.user,
        } as unknown);

        created++;
      } catch (error) {
        this.loggerService.error(
          `${this.constructorName} ${caller} - Failed to create draft post`,
          error,
        );
      }
    }

    return created;
  }

  private parseFrequency(frequency?: string): number {
    switch (frequency?.toLowerCase()) {
      case 'daily':
        return 1;
      case 'twice-daily':
        return 1;
      case 'weekly':
        return 7;
      case 'biweekly':
        return 14;
      case 'monthly':
        return 30;
      default:
        return 1;
    }
  }

  private async getPersonaOrFail(
    personaId: Types.ObjectId,
    organization: Types.ObjectId,
  ): Promise<PersonaDocument> {
    const persona = await this.personasService.findOne({
      _id: personaId,
      isDeleted: false,
      organization,
    });

    if (!persona) {
      throw new NotFoundException('Persona not found');
    }

    return persona;
  }
}
