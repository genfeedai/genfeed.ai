import type { SkillSurface } from '@genfeedai/contracts';
import type {
  SkillVersionListQueryV1,
  SkillVersionMetadataV1,
  SkillVersionReadPageV1,
  SkillVersionReadV1,
} from '@genfeedai/contracts/interfaces/ai/skill-version-read.interface';
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

export class SkillVersionReadUnavailableError extends Error {
  constructor() {
    super('Skill versions are unavailable.');
    this.name = 'SkillVersionReadUnavailableError';
  }
}
function versionReadInvalid(): never {
  throw new SkillVersionReadUnavailableError();
}
function versionObject(
  input: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return versionReadInvalid();
  const record = input as Record<string, unknown>;
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    return versionReadInvalid();
  return record;
}
function versionInteger(input: unknown, maximum = 2147483647): number {
  if (
    typeof input !== 'number' ||
    !Number.isInteger(input) ||
    input < 1 ||
    input > maximum
  )
    return versionReadInvalid();
  return input;
}
function versionSkillIdentity(skillId: string): void {
  if (typeof skillId !== 'string' || !skillId || skillId !== skillId.trim())
    versionReadInvalid();
}
function versionQuery(
  query: SkillVersionListQueryV1,
): Required<Pick<SkillVersionListQueryV1, 'limit'>> & SkillVersionListQueryV1 {
  if (
    !query ||
    typeof query !== 'object' ||
    Array.isArray(query) ||
    Reflect.ownKeys(query).some(
      (key) => key !== 'limit' && key !== 'beforeVersionNumber',
    )
  )
    return versionReadInvalid();
  return {
    limit: Object.hasOwn(query, 'limit') ? versionInteger(query.limit, 50) : 20,
    ...(Object.hasOwn(query, 'beforeVersionNumber')
      ? { beforeVersionNumber: versionInteger(query.beforeVersionNumber) }
      : {}),
  };
}
function versionLinks(
  input: unknown,
  collection: boolean,
): Record<string, unknown> {
  const links = versionObject(
    input,
    collection ? ['self', 'cursor'] : ['self'],
  );
  if (typeof links.self !== 'string' || !links.self.trim())
    versionReadInvalid();
  return links;
}
function versionMetadata(
  input: unknown,
  skillId: string,
  detail: boolean,
): SkillVersionMetadataV1 {
  const row = versionObject(input, ['type', 'id', 'attributes']);
  const attributes = versionObject(
    row.attributes,
    detail
      ? ['versionNumber', 'createdAt', 'contentHash', 'instructionText']
      : ['versionNumber', 'createdAt', 'contentHash'],
  );
  const versionNumber = versionInteger(attributes.versionNumber);
  if (
    row.type !== 'skill-version' ||
    typeof row.id !== 'string' ||
    row.id !== `sv1_${skillId}_${versionNumber}` ||
    typeof attributes.contentHash !== 'string' ||
    attributes.contentHash.length !== 80 ||
    !/^sha256:skill-v1:[a-f0-9]{64}$/.test(attributes.contentHash) ||
    typeof attributes.createdAt !== 'string'
  )
    return versionReadInvalid();
  const createdAt = new Date(attributes.createdAt);
  if (
    !Number.isFinite(createdAt.getTime()) ||
    createdAt.toISOString() !== attributes.createdAt
  )
    return versionReadInvalid();
  return {
    id: row.id,
    versionNumber,
    contentHash: attributes.contentHash,
    createdAt: attributes.createdAt,
  };
}
export function parseSkillVersionReadPageV1(
  input: unknown,
  skillId: string,
  query: SkillVersionListQueryV1 = {},
): SkillVersionReadPageV1 {
  versionSkillIdentity(skillId);
  const requested = versionQuery(query);
  const wire = versionObject(input, ['data', 'links']);
  const links = versionLinks(wire.links, true);
  const cursor = versionObject(links.cursor, [
    'limit',
    'hasMore',
    'nextCursor',
  ]);
  if (
    !Array.isArray(wire.data) ||
    wire.data.length > requested.limit ||
    cursor.limit !== requested.limit ||
    typeof cursor.hasMore !== 'boolean'
  )
    return versionReadInvalid();
  const items = wire.data.map((row) => versionMetadata(row, skillId, false));
  let previous = requested.beforeVersionNumber ?? 2147483648;
  for (const item of items) {
    if (item.versionNumber >= previous) versionReadInvalid();
    previous = item.versionNumber;
  }
  if (cursor.hasMore !== (cursor.nextCursor !== null))
    return versionReadInvalid();
  const nextCursor =
    cursor.nextCursor === null ? null : versionInteger(cursor.nextCursor);
  if (
    cursor.hasMore &&
    (items.length !== requested.limit ||
      nextCursor !== items[items.length - 1]?.versionNumber ||
      nextCursor === 1)
  )
    return versionReadInvalid();
  return { items, limit: requested.limit, hasMore: cursor.hasMore, nextCursor };
}
export function parseSkillVersionReadV1(
  input: unknown,
  skillId: string,
  versionId: string,
): SkillVersionReadV1 {
  versionSkillIdentity(skillId);
  const wire = versionObject(input, ['data', 'links']);
  versionLinks(wire.links, false);
  const metadata = versionMetadata(wire.data, skillId, true);
  const row = versionObject(wire.data, ['type', 'id', 'attributes']);
  const attributes = versionObject(row.attributes, [
    'versionNumber',
    'createdAt',
    'contentHash',
    'instructionText',
  ]);
  if (
    metadata.id !== versionId ||
    typeof attributes.instructionText !== 'string'
  )
    return versionReadInvalid();
  return { ...metadata, instructionText: attributes.instructionText };
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

  async listSkillVersions(
    skillId: string,
    query: SkillVersionListQueryV1 = {},
  ): Promise<SkillVersionReadPageV1> {
    try {
      versionSkillIdentity(skillId);
      const requested = versionQuery(query);
      const response = await this.instance.get<unknown>(
        `/${encodeURIComponent(skillId)}/versions`,
        { params: requested },
      );
      return parseSkillVersionReadPageV1(response.data, skillId, requested);
    } catch {
      throw new SkillVersionReadUnavailableError();
    }
  }
  async getSkillVersion(
    skillId: string,
    versionId: string,
  ): Promise<SkillVersionReadV1> {
    try {
      versionSkillIdentity(skillId);
      const prefix = `sv1_${skillId}_`;
      if (
        typeof versionId !== 'string' ||
        !versionId.startsWith(prefix) ||
        !/^[1-9][0-9]*$/.test(versionId.slice(prefix.length))
      )
        versionReadInvalid();
      const requestedNumber = versionInteger(
        Number(versionId.slice(prefix.length)),
      );
      if (versionId !== `${prefix}${requestedNumber}`) versionReadInvalid();
      const response = await this.instance.get<unknown>(
        `/${encodeURIComponent(skillId)}/versions/${encodeURIComponent(versionId)}`,
      );
      return parseSkillVersionReadV1(response.data, skillId, versionId);
    } catch {
      throw new SkillVersionReadUnavailableError();
    }
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
