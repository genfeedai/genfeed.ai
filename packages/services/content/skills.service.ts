import type { IServiceSerializer } from '@cloud/interfaces/utils/error.interface';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';

const skillSerializer: IServiceSerializer<Skill> = {
  serialize: (data) => data,
};

export type SkillSource = 'built_in' | 'custom' | 'imported';
export type SkillStatus = 'disabled' | 'draft' | 'published';
export type SkillModality = 'audio' | 'image' | 'multi' | 'text' | 'video';
export type SkillWorkflowStage =
  | 'analysis'
  | 'creation'
  | 'planning'
  | 'publishing'
  | 'research'
  | 'review';

export interface SkillInput {
  baseSkill?: string;
  category: string;
  channels: string[];
  defaultInstructions?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  modalities: SkillModality[];
  name: string;
  outputSchema?: Record<string, unknown>;
  requiredProviders?: string[];
  reviewDefaults?: Record<string, unknown>;
  slug: string;
  source?: SkillSource;
  status?: SkillStatus;
  workflowStage: SkillWorkflowStage;
}

export interface SkillCustomizeInput {
  description?: string;
  name?: string;
  slug?: string;
}

export class Skill {
  id!: string;
  baseSkill?: string;
  category!: string;
  channels!: string[];
  defaultInstructions?: string;
  description!: string;
  inputSchema?: Record<string, unknown>;
  isBuiltIn!: boolean;
  isEnabled!: boolean;
  modalities!: SkillModality[];
  name!: string;
  organization?: string | null;
  outputSchema?: Record<string, unknown>;
  requiredProviders!: string[];
  reviewDefaults?: Record<string, unknown>;
  slug!: string;
  source!: SkillSource;
  status!: SkillStatus;
  workflowStage!: SkillWorkflowStage;

  constructor(partial: Partial<Skill>) {
    Object.assign(this, partial);
  }
}

export class SkillsService extends BaseService<
  Skill,
  SkillInput,
  Partial<SkillInput>
> {
  constructor(token: string) {
    super('/skills', token, Skill, skillSerializer);
  }

  public static getInstance(token: string): SkillsService {
    return BaseService.getDataServiceInstance(
      SkillsService,
      token,
    ) as SkillsService;
  }

  async listSkills(): Promise<Skill[]> {
    return this.findAll();
  }

  async getSkill(id: string): Promise<Skill> {
    return this.instance
      .get<JsonApiResponseDocument>(`/${id}`)
      .then((response) => this.mapOne(response.data));
  }

  async createSkill(input: SkillInput): Promise<Skill> {
    return this.post(input);
  }

  async importSkill(input: SkillInput): Promise<Skill> {
    return this.instance
      .post<JsonApiResponseDocument>('/import', input)
      .then((response) => this.mapOne(response.data));
  }

  async customizeSkill(id: string, input: SkillCustomizeInput): Promise<Skill> {
    return this.instance
      .post<JsonApiResponseDocument>(`/${id}/customize`, input)
      .then((response) => this.mapOne(response.data));
  }

  async updateSkill(id: string, input: Partial<SkillInput>): Promise<Skill> {
    return this.patch(id, input);
  }
}
