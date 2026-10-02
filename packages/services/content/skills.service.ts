import type { SkillSurface } from '@genfeedai/contracts';
import type { IServiceSerializer } from '@genfeedai/contracts/interfaces/utils/error.interface';
import {
  BaseService,
  type JsonApiResponseDocument,
} from '@services/core/base.service';
import type { AxiosResponse } from 'axios';

const skillSerializer: IServiceSerializer<Skill> = {
  serialize: (data) => data,
};

export type SkillSource = 'built_in' | 'custom' | 'customized' | 'imported';
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
  systemPromptTemplate?: string;
  toolOverrides?: string[];
  workflowStage: SkillWorkflowStage;
}

export interface SkillPackageImportInput {
  slug: string;
  sourceUrl?: string;
  expectedPackageChecksum?: string;
  package:
    | { format: 'files'; files: { content: string; path: string }[] }
    | { format: 'zip'; archiveBase64: string };
}

export class SkillImportCreatedUnavailableError extends Error {
  constructor() {
    super(
      'Skill import was created, but details are unavailable. Refresh the skill library.',
    );
    this.name = 'SkillImportCreatedUnavailableError';
  }
}
export type SkillImportRejection =
  | 'validation'
  | 'authentication'
  | 'forbidden'
  | 'rateLimit'
  | 'duplicate';
export class SkillImportRejectedError extends Error {
  constructor(readonly reason: SkillImportRejection) {
    super('Skill package import was rejected before creation.');
    this.name = 'SkillImportRejectedError';
  }
}

/** Classify only endpoint status and its exact canonical post-write marker; never return raw error data. */
export function classifySkillImportFailure(
  failure: unknown,
): SkillImportCreatedUnavailableError | SkillImportRejectedError | null {
  if (
    failure instanceof SkillImportCreatedUnavailableError ||
    failure instanceof SkillImportRejectedError
  )
    return failure;
  if (!failure || typeof failure !== 'object') return null;
  const record = failure as Record<string, unknown>;
  const response =
    record.response && typeof record.response === 'object'
      ? (record.response as Record<string, unknown>)
      : null;
  const body =
    response?.data && typeof response.data === 'object'
      ? (response.data as Record<string, unknown>)
      : record;
  const errors = Array.isArray(body.errors) ? body.errors : [];
  const first =
    errors[0] && typeof errors[0] === 'object'
      ? (errors[0] as Record<string, unknown>)
      : null;
  const status =
    response?.status ??
    record.status ??
    body.statusCode ??
    first?.status ??
    (record.isAuthError === true ? 401 : undefined);
  const canonicalCreated =
    'Skill import was created, but details are unavailable. Refresh the skill library.';
  if (
    (status === 403 || status === '403') &&
    (body.message === canonicalCreated || first?.detail === canonicalCreated)
  )
    return new SkillImportCreatedUnavailableError();
  const statusKey =
    typeof status === 'number'
      ? String(status)
      : typeof status === 'string'
        ? status
        : undefined;
  switch (statusKey) {
    case '400':
    case '422':
      return new SkillImportRejectedError('validation');
    case '401':
      return new SkillImportRejectedError('authentication');
    case '403':
      return new SkillImportRejectedError('forbidden');
    case '409':
      return new SkillImportRejectedError('duplicate');
    case '429':
      return new SkillImportRejectedError('rateLimit');
    default:
      return null;
  }
}

export interface ListSkillsOptions {
  /** Narrow the catalog to skills offered on one composer surface. */
  surface?: SkillSurface;
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
  /** Injected by the runtime while the brand has no explicit enabled skills. */
  isDefault?: boolean;
  isEnabled!: boolean;
  modalities!: SkillModality[];
  name!: string;
  organization?: string | null;
  outputSchema?: Record<string, unknown>;
  requiredProviders!: string[];
  reviewDefaults?: Record<string, unknown>;
  slug!: string;
  source!: SkillSource;
  sourceListingId?: string;
  status!: SkillStatus;
  canEdit?: boolean;
  canExport?: boolean;
  canFork?: boolean;
  canPublish?: boolean;
  canRead?: boolean;
  canShare?: boolean;
  canUse?: boolean;
  /** Composer surfaces this skill is offered on; derived client-side when absent. */
  surfaces?: string[];
  systemPromptTemplate?: string;
  toolOverrides?: string[];
  version?: string;
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

  public static forOrganization(
    token: string,
    organizationId: string,
  ): SkillsService {
    const service = new SkillsService(token);
    service.bindRequestOrganization(organizationId);
    return service;
  }

  public static getInstance(token: string): SkillsService {
    return BaseService.getDataServiceInstance(SkillsService, token);
  }

  async listSkills(options: ListSkillsOptions = {}): Promise<Skill[]> {
    return this.findAll(
      options.surface ? { surface: options.surface } : undefined,
    );
  }

  async getSkill(id: string): Promise<Skill> {
    return this.instance
      .get<JsonApiResponseDocument>(`/${id}`)
      .then((response) => this.mapOne(response.data));
  }

  async createSkill(input: SkillInput): Promise<Skill> {
    return this.post(input);
  }

  async importSkill(input: SkillPackageImportInput): Promise<Skill> {
    let response: AxiosResponse<JsonApiResponseDocument>;
    try {
      response = await this.instance.post<JsonApiResponseDocument>(
        '/import',
        input,
      );
    } catch (failure) {
      throw classifySkillImportFailure(failure) ?? failure;
    }
    try {
      const imported = await this.mapOne(response.data);
      if (
        typeof imported.id !== 'string' ||
        !imported.id ||
        imported.id !== imported.id.trim() ||
        /[\\/?#]/.test(imported.id) ||
        [...imported.id].some(
          (character) =>
            character.charCodeAt(0) <= 32 ||
            (character.charCodeAt(0) >= 127 && character.charCodeAt(0) <= 159),
        )
      )
        throw new SkillImportCreatedUnavailableError();
      return imported;
    } catch {
      throw new SkillImportCreatedUnavailableError();
    }
  }

  async forkSkill(id: string): Promise<Skill> {
    return this.instance
      .post<JsonApiResponseDocument>(`/${encodeURIComponent(id)}/fork`, {})
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

  async exportSkill(id: string): Promise<Record<string, unknown>> {
    const response = await this.instance.get<Record<string, unknown>>(
      `/${id}/export`,
    );
    return response.data;
  }

  async archiveSkill(id: string): Promise<void> {
    await this.instance.post(`/${id}/archive`, {});
  }

  async rollbackSkill(id: string, versionId: string): Promise<Skill> {
    return this.instance
      .post<JsonApiResponseDocument>(`/${id}/rollback`, { versionId })
      .then((response) => this.mapOne(response.data));
  }
}
