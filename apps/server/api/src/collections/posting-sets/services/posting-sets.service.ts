import type { CreatePostingSetDto } from '@api/collections/posting-sets/dto/create-posting-set.dto';
import type { ExpandPostingSetDto } from '@api/collections/posting-sets/dto/expand-posting-set.dto';
import type { PostingSetsQueryDto } from '@api/collections/posting-sets/dto/posting-sets-query.dto';
import type { UpdatePostingSetDto } from '@api/collections/posting-sets/dto/update-posting-set.dto';
import type { PostingSetDocument } from '@api/collections/posting-sets/schemas/posting-set.schema';
import {
  parseCreatePostingSetInput,
  parseStoredPostingSetTargets,
  parseUpdatePostingSetInput,
  referencedCredentialIds,
  referencedSignatureIds,
  type StoredCredentialRefRow,
  type StoredPostingSetRow,
  toCredentialRefs,
  toPostingSetInput,
  toPostingSignatureInput,
} from '@api/collections/posting-sets/services/posting-set-persistence.helpers';
import { PostingSignaturesService } from '@api/collections/posting-sets/services/posting-signatures.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetValidationState } from '@genfeedai/contracts';
import {
  expandPostingSetTargets,
  expandPostingSetTargetsInputSchema,
  type PostingSignatureInput,
  validatePostingSetLifecycle,
} from '@genfeedai/contracts/api-types/contracts/posting-sets.contract';
import type { ChannelTargetInput } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type { IPostingSetScope } from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

const CREDENTIAL_REF_SELECT = {
  id: true,
  isConnected: true,
  isDeleted: true,
  platform: true,
} as const;

@Injectable()
export class PostingSetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postingSignaturesService: PostingSignaturesService,
  ) {}

  async createScoped(
    dto: CreatePostingSetDto,
    context: IPostingSetScope,
  ): Promise<PostingSetDocument> {
    const input = parseCreatePostingSetInput(dto);
    const created = await this.delegate().create({
      data: {
        brandId: input.brandId ?? context.brandId ?? null,
        description: input.description ?? null,
        isEnabled: input.isEnabled ?? true,
        label: input.label,
        organizationId: context.organizationId,
        targets: toPrismaJson(input.targets),
        userId: context.userId,
      },
    });
    return this.hydrate(created, context.organizationId);
  }

  async findAllScoped(context: IPostingSetScope, query: PostingSetsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const where = scopedWhere(context.organizationId, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled }),
      ...(query.label ? { label: query.label } : {}),
    });
    const [docs, total] = await Promise.all([
      this.delegate().findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.delegate().count({ where }),
    ]);

    return {
      docs: await Promise.all(
        docs.map((row) => this.hydrate(row, context.organizationId)),
      ),
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async findOneScoped(
    id: string,
    context: IPostingSetScope,
  ): Promise<PostingSetDocument> {
    const row = await this.requireRow(id, context);
    return this.hydrate(row, context.organizationId);
  }

  async updateScoped(
    id: string,
    dto: UpdatePostingSetDto,
    context: IPostingSetScope,
  ): Promise<PostingSetDocument> {
    const existing = await this.requireRow(id, context);
    const input = parseUpdatePostingSetInput(dto);
    const updated = await this.delegate().update({
      data: {
        ...(input.brandId === undefined ? {} : { brandId: input.brandId }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.isEnabled === undefined
          ? {}
          : { isEnabled: input.isEnabled }),
        ...(input.label === undefined ? {} : { label: input.label }),
        ...(input.targets === undefined
          ? {}
          : { targets: toPrismaJson(input.targets) }),
      },
      where: scopedWhere(context.organizationId, { id: existing.id }),
    });
    return this.hydrate(updated, context.organizationId);
  }

  async removeScoped(id: string, context: IPostingSetScope): Promise<void> {
    const existing = await this.requireRow(id, context);
    await this.delegate().update({
      data: { isDeleted: true },
      where: scopedWhere(context.organizationId, { id: existing.id }),
    });
  }

  async expandScoped(
    id: string,
    dto: ExpandPostingSetDto,
    context: IPostingSetScope,
  ): Promise<ChannelTargetInput[]> {
    const postingSet = await this.findOneScoped(id, context);
    const signatures = await this.loadSignatureInputs(
      referencedSignatureIds(postingSet.targets),
      context.organizationId,
    );
    const parsed = expandPostingSetTargetsInputSchema.safeParse({
      overrides: dto.overrides,
      postingSet: toPostingSetInput({
        ...postingSet,
        targets: postingSet.targets,
      }),
      scheduledDate: dto.scheduledDate,
      signatures,
      timezone: dto.timezone,
    });
    if (!parsed.success) {
      throw new BadRequestException({
        detail: parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; '),
        title: 'Invalid posting set expansion payload',
      });
    }
    return expandPostingSetTargets(parsed.data);
  }

  private async requireRow(
    id: string,
    context: IPostingSetScope,
  ): Promise<StoredPostingSetRow> {
    if (!context.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    const row = await this.delegate().findFirst({
      where: scopedWhere(context.organizationId, { id }),
    });
    if (!row) {
      throw new NotFoundException('Posting set', id);
    }
    return row as StoredPostingSetRow;
  }

  private async hydrate(
    row: StoredPostingSetRow,
    organizationId: string,
  ): Promise<PostingSetDocument> {
    const targets = parseStoredPostingSetTargets(row.targets);
    const postingSet = toPostingSetInput({ ...row, targets });
    const [credentials, signatures] = await Promise.all([
      this.loadCredentialRefs(referencedCredentialIds(targets), organizationId),
      this.loadSignatureInputs(referencedSignatureIds(targets), organizationId),
    ]);

    return {
      brandId: row.brandId,
      createdAt: row.createdAt,
      description: row.description,
      id: row.id,
      isDeleted: row.isDeleted,
      isEnabled: row.isEnabled,
      label: row.label,
      organizationId: row.organizationId,
      targets,
      updatedAt: row.updatedAt,
      userId: row.userId,
      validation:
        targets.length === 0
          ? {
              signatures: [],
              state: TargetValidationState.INVALID,
              targets: [],
            }
          : validatePostingSetLifecycle({
              credentials,
              postingSet,
              signatures,
            }),
    };
  }

  private async loadCredentialRefs(
    credentialIds: readonly string[],
    organizationId: string,
  ): Promise<ReturnType<typeof toCredentialRefs>> {
    if (credentialIds.length === 0) {
      return [];
    }

    const rows = (await this.prisma.credential.findMany({
      select: CREDENTIAL_REF_SELECT,
      where: scopedWhere(organizationId, {
        id: { in: [...credentialIds] },
      }),
    })) as StoredCredentialRefRow[];

    return toCredentialRefs(rows);
  }

  private async loadSignatureInputs(
    signatureIds: readonly string[],
    organizationId: string,
  ): Promise<PostingSignatureInput[]> {
    const signatures = await this.postingSignaturesService.findByIdsScoped(
      signatureIds,
      organizationId,
    );
    return signatures
      .map((signature) =>
        toPostingSignatureInput({
          body: signature.body,
          brandId: signature.brandId,
          createdAt: signature.createdAt,
          id: signature.id,
          isDeleted: signature.isDeleted,
          isEnabled: signature.isEnabled,
          label: signature.label,
          organizationId: signature.organizationId,
          placement: signature.placement,
          platforms: signature.platforms,
          updatedAt: signature.updatedAt,
          userId: signature.userId,
        }),
      )
      .filter((signature) => signature.platforms.length > 0);
  }

  private delegate() {
    return this.prisma.postingSet;
  }
}
