import { CreateClipperResultDto } from '@api/collections/clipper-results/dto/create-clipper-result.dto';
import { UpdateClipperResultDto } from '@api/collections/clipper-results/dto/update-clipper-result.dto';
import type { ClipperResultDocument } from '@api/collections/clipper-results/schemas/clipper-result.schema';
import {
  buildClipperResultReadiness,
  isTerminalClipStatus,
} from '@api/collections/clipper-shared/clipper-terminal-contract.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BaseService,
  type PopulateInput,
} from '@api/shared/services/base/base.service';
import {
  CLIPPER_TERMINAL_STATUSES,
  type ClipperLibraryLinkStatus,
  type ClipperReferenceProvenance,
  type ClipperTerminalStatus,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  getTenantContext,
  isCrossOrgUnsafe,
} from '@libs/prisma/tenant-context';
import { Injectable } from '@nestjs/common';

type ClipperResultWriteDto = Partial<
  CreateClipperResultDto & UpdateClipperResultDto
> &
  Record<string, unknown>;

export type ProviderTerminalTransitionInput = {
  clipperResultId: string;
  error?: string;
  providerJobId: string;
  providerName: string;
  status: ClipperTerminalStatus;
  videoUrl?: string;
};

const RESULT_SCALAR_KEYS = new Set([
  'data',
  'ingredientId',
  'isDeleted',
  'isSelected',
  'mode',
  'organizationId',
  'projectId',
  'providerJobId',
  'readiness',
  'status',
  'terminalAt',
  'userId',
  'viralityScore',
]);

@Injectable()
export class ClipperResultsService extends BaseService<
  ClipperResultDocument,
  CreateClipperResultDto,
  UpdateClipperResultDto,
  Prisma.ClipperResultWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'clipperResult', logger);
  }

  protected override normalizeDocument(
    document: unknown,
  ): ClipperResultDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const payload = this.readRecord(record.data);

    return { ...payload, ...record } as ClipperResultDocument;
  }

  override async create(
    createDto: CreateClipperResultDto,
    populate: PopulateInput = [],
  ): Promise<ClipperResultDocument> {
    return this.persistCreate(
      createDto as unknown as ClipperResultWriteDto,
      populate,
    );
  }

  async createGenerated(
    createDto: CreateClipperResultDto,
    referenceProvenance: ClipperReferenceProvenance,
    populate: PopulateInput = [],
  ): Promise<ClipperResultDocument> {
    return this.persistCreate(
      { ...createDto, referenceProvenance } as ClipperResultWriteDto,
      populate,
    );
  }

  private async persistCreate(
    createDto: ClipperResultWriteDto,
    populate: PopulateInput,
  ): Promise<ClipperResultDocument> {
    return await super.create(
      this.toPrismaWriteData(
        createDto,
        'create',
      ) as unknown as CreateClipperResultDto,
      populate,
    );
  }

  async createForOrganization(
    createDto: CreateClipperResultDto & {
      organizationId: string;
      userId: string;
    },
    populate: PopulateInput = [],
  ): Promise<ClipperResultDocument> {
    const project = await this.prisma.clipperProject.findFirst({
      select: { id: true },
      where: {
        id: createDto.projectId,
        isDeleted: false,
        organizationId: createDto.organizationId,
      },
    });

    if (!project) {
      throw new NotFoundException('ClipperProject', createDto.projectId);
    }

    return this.create(createDto, populate);
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateClipperResultDto> | Record<string, unknown>,
    populate: PopulateInput = [],
    organizationId?: string,
  ): Promise<ClipperResultDocument> {
    const existing = await this.findOne({
      id: id,
      isDeleted: false,
      ...(organizationId !== undefined ? { organizationId } : {}),
    });
    if (!existing) {
      throw new NotFoundException('ClipperResult', id);
    }
    const existingData = this.readRecord(
      (existing as Record<string, unknown>).data,
    );
    const canonicalId =
      typeof existing.id === 'string' && existing.id.length > 0
        ? existing.id
        : id;

    return await super.patch(
      canonicalId,
      this.toPrismaWriteData(updateDto, 'update', existingData),
      populate,
    );
  }

  async findByProject(
    projectId: string,
    organizationId?: string,
    limit?: number,
  ): Promise<ClipperResultDocument[]> {
    // `limit` is set by the HTTP controller only; internal reconciliation
    // callers need the full result set and omit it.
    const docs = await this.delegate.findMany({
      where: {
        isDeleted: false,
        ...(organizationId ? { organizationId } : {}),
        projectId,
      },
      orderBy: { viralityScore: 'desc' },
      ...(limit ? { take: limit } : {}),
    });

    return this.normalizeDocuments(docs);
  }

  async findByProviderJobId(
    providerJobId: string,
  ): Promise<ClipperResultDocument | null> {
    const result = await this.delegate.findFirst({
      where: {
        isDeleted: false,
        providerJobId,
      },
    });

    return result ? this.normalizeDocument(result) : null;
  }

  /**
   * Atomically claims a provider-owned clip's terminal transition.
   * Only one concurrent terminal delivery can move the row out of a
   * nonterminal status; later deliveries observe a zero-row update.
   */
  async transitionProviderTerminal(
    input: ProviderTerminalTransitionInput,
  ): Promise<boolean> {
    // Webhooks and workers carry no tenant context and key the claim by
    // provider job; an inline completion inside a request also stays inside
    // the request organization.
    const requestOrganizationId = isCrossOrgUnsafe()
      ? undefined
      : getTenantContext()?.organizationId;
    const where: Prisma.ClipperResultWhereInput = {
      data: { equals: input.providerName, path: ['providerName'] },
      id: input.clipperResultId,
      isDeleted: false,
      ...(requestOrganizationId
        ? { organizationId: requestOrganizationId }
        : {}),
      providerJobId: input.providerJobId,
      status: { notIn: [...CLIPPER_TERMINAL_STATUSES] },
    };
    const existing = await this.delegate.findFirst({
      select: { data: true, organizationId: true },
      where,
    });
    if (!existing) {
      return false;
    }

    const updateDto: ClipperResultWriteDto = {
      providerJobId: input.providerJobId,
      providerName: input.providerName,
      status: input.status,
      ...(input.error ? { error: input.error } : {}),
      ...(input.videoUrl ? { videoUrl: input.videoUrl } : {}),
    };
    const result = await this.delegate.updateMany({
      data: this.toPrismaWriteData(
        updateDto,
        'update',
        this.readRecord(existing.data),
      ),
      where: {
        ...where,
        organizationId: existing.organizationId,
      },
    });

    return result.count === 1;
  }

  // Named distinctly from BaseService.findAllByOrganization — this variant
  // takes a row cap for the HTTP listing and must not override the base
  // signature (filters/sort/populate).
  async findRecentByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<ClipperResultDocument[]> {
    const results = await this.delegate.findMany({
      orderBy: { createdAt: 'desc' },
      where: { isDeleted: false, organizationId },
      ...(limit ? { take: limit } : {}),
    });

    return this.normalizeDocuments(results);
  }

  async countActiveRawCuts(): Promise<number> {
    return this.delegate.count({
      where: {
        isDeleted: false,
        mode: 'raw-cut',
        status: { in: ['extracting', 'reframing', 'captioning', 'validating'] },
      },
    });
  }

  async findActiveRawCuts(
    limit = 100,
    skip = 0,
  ): Promise<ClipperResultDocument[]> {
    const results = await this.delegate.findMany({
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      skip,
      take: limit,
      where: {
        isDeleted: false,
        mode: 'raw-cut',
        status: { in: ['extracting', 'reframing', 'captioning', 'validating'] },
      },
    });

    return this.normalizeDocuments(results);
  }

  async countRawCutsPendingProjectReconciliation(): Promise<number> {
    return this.delegate.count({
      where: {
        data: {
          equals: true,
          path: ['isProjectReconciliationPending'],
        },
        isDeleted: false,
        mode: 'raw-cut',
        status: { in: ['completed', 'degraded', 'failed'] },
      },
    });
  }

  async findRawCutsPendingProjectReconciliation(
    limit = 100,
    skip = 0,
  ): Promise<ClipperResultDocument[]> {
    const results = await this.delegate.findMany({
      orderBy: [{ terminalAt: 'asc' }, { id: 'asc' }],
      skip,
      take: limit,
      where: {
        data: {
          equals: true,
          path: ['isProjectReconciliationPending'],
        },
        isDeleted: false,
        mode: 'raw-cut',
        status: { in: ['completed', 'degraded', 'failed'] },
      },
    });

    return this.normalizeDocuments(results);
  }

  async claimLibraryIngredient(input: {
    clipperResultId: string;
    ingredientId: string;
    organizationId: string;
  }): Promise<boolean> {
    const where: Prisma.ClipperResultWhereInput = scopedWhere(
      input.organizationId,
      {
        id: input.clipperResultId,
        OR: [{ ingredientId: null }, { ingredientId: input.ingredientId }],
      },
    );
    const existing = await this.delegate.findFirst({
      select: { data: true },
      where,
    });
    if (!existing) {
      return false;
    }

    // sql-risk-audit: ignore bulk-write-tenant-review -- Compare-and-swap for one clip result; `where` is scopedWhere(organizationId, { id, isDeleted }).
    const result = await this.delegate.updateMany({
      data: this.toPrismaWriteData(
        {
          ingredientId: input.ingredientId,
          libraryLinkError: null,
          libraryLinkStatus: 'linked',
        },
        'update',
        this.readRecord(existing.data),
      ),
      where,
    });

    return result.count === 1;
  }

  async markLibraryLinkState(input: {
    clipperResultId: string;
    error?: string | null;
    organizationId: string;
    status: ClipperLibraryLinkStatus;
  }): Promise<void> {
    const where: Prisma.ClipperResultWhereInput = scopedWhere(
      input.organizationId,
      { id: input.clipperResultId },
    );
    const existing = await this.delegate.findFirst({
      select: { data: true },
      where,
    });
    if (!existing) {
      return;
    }

    // sql-risk-audit: ignore bulk-write-tenant-review -- Single clip result status write; `where` is scopedWhere(organizationId, { id, isDeleted }).
    await this.delegate.updateMany({
      data: this.toPrismaWriteData(
        {
          libraryLinkError: input.error ?? null,
          libraryLinkStatus: input.status,
        },
        'update',
        this.readRecord(existing.data),
      ),
      where,
    });
  }

  async findProjectResultForHandoff(input: {
    clipperResultId: string;
    organizationId: string;
    projectId: string;
  }): Promise<ClipperResultDocument | null> {
    const result = await this.delegate.findFirst({
      where: scopedWhere(input.organizationId, {
        OR: [
          { id: input.clipperResultId },
          { providerJobId: input.clipperResultId },
        ],
        projectId: input.projectId,
      }),
    });

    return result ? this.normalizeDocument(result) : null;
  }

  private toPrismaWriteData(
    dto: ClipperResultWriteDto,
    mode: 'create' | 'update',
    existingData: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const payloadData: Record<string, unknown> = { ...existingData };

    if (typeof dto.organizationId === 'string') {
      data.organizationId = dto.organizationId;
    }

    if (Object.hasOwn(dto, 'projectId')) {
      data.projectId = dto.projectId ?? null;
    }

    if (Object.hasOwn(dto, 'userId')) {
      data.userId = dto.userId ?? null;
    }

    this.assignIfOwn(data, dto, 'providerJobId');
    this.assignIfOwn(data, dto, 'viralityScore');
    this.assignIfOwn(data, dto, 'mode');
    this.assignIfOwn(data, dto, 'status');
    this.assignIfOwn(data, dto, 'isSelected');
    this.assignIfOwn(data, dto, 'readiness');
    this.assignIfOwn(data, dto, 'terminalAt');
    this.assignIfOwn(data, dto, 'isDeleted');
    this.assignIfOwn(data, dto, 'ingredientId');

    for (const [key, value] of Object.entries(dto)) {
      if (RESULT_SCALAR_KEYS.has(key) || value === undefined) {
        continue;
      }
      payloadData[key] = value;
    }

    const suppliedData = this.readRecord(dto.data);
    data.data = { ...payloadData, ...suppliedData };

    this.applyTerminalDefaults(data, mode);

    return data;
  }

  private applyTerminalDefaults(
    data: Record<string, unknown>,
    mode: 'create' | 'update',
  ): void {
    if (mode === 'create' && typeof data.status !== 'string') {
      data.status = 'pending';
    }

    if (typeof data.status !== 'string') {
      return;
    }

    if (
      isTerminalClipStatus(data.status) &&
      !Object.hasOwn(data, 'terminalAt')
    ) {
      data.terminalAt = new Date();
    }

    if (!Object.hasOwn(data, 'readiness')) {
      data.readiness = buildClipperResultReadiness({
        status: data.status,
        terminalAt: this.readTerminalAt(data.terminalAt),
      });
    }
  }

  private assignIfOwn(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
    key: string,
  ): void {
    if (Object.hasOwn(source, key)) {
      target[key] = source[key];
    }
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readTerminalAt(value: unknown): Date | string | null {
    if (value instanceof Date || typeof value === 'string' || value === null) {
      return value;
    }

    return null;
  }
}
