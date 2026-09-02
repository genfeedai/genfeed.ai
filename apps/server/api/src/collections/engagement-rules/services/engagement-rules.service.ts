import type { CreateEngagementRuleDto } from '@api/collections/engagement-rules/dto/create-engagement-rule.dto';
import type { EngagementRulesQueryDto } from '@api/collections/engagement-rules/dto/engagement-rules-query.dto';
import type { UpdateEngagementRuleDto } from '@api/collections/engagement-rules/dto/update-engagement-rule.dto';
import type {
  EngagementRuleDocument,
  EngagementRuleScope,
} from '@api/collections/engagement-rules/schemas/engagement-rule.schema';
import {
  parseActionPayload,
  parseCreateEngagementRuleInput,
  parseMetricSnapshot,
  parseStoredEngagementMetric,
  parseStoredEngagementRuleAction,
  parseStoredEngagementRuleMode,
  parseStoredEngagementRuleState,
  parseUpdateEngagementRuleInput,
  type StoredEngagementRuleRow,
} from '@api/collections/engagement-rules/services/engagement-rule-persistence.helpers';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { EngagementRuleState } from '@genfeedai/enums';
import { toPrismaJson } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class EngagementRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async createScoped(
    dto: CreateEngagementRuleDto,
    context: EngagementRuleScope,
  ): Promise<EngagementRuleDocument> {
    const input = parseCreateEngagementRuleInput(dto);
    await this.assertTargetExists(
      context.organizationId,
      input.postGroupId,
      input.targetId,
    );
    const created = await this.delegate().create({
      data: {
        actionPayload: toPrismaJson(input.actionPayload ?? { channels: [] }),
        actionType: input.actionType,
        brandId: input.brandId ?? context.brandId ?? null,
        isEnabled: input.isEnabled ?? true,
        metric: input.metric,
        mode: input.mode,
        organizationId: context.organizationId,
        postGroupId: input.postGroupId,
        state: EngagementRuleState.ARMED,
        targetId: input.targetId,
        threshold: input.threshold,
        userId: context.userId,
        windowEndsAt: input.windowEndsAt ? new Date(input.windowEndsAt) : null,
      },
    });
    return this.toDocument(created);
  }

  async findAllScoped(
    context: EngagementRuleScope,
    query: EngagementRulesQueryDto,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const where = scopedWhere(context.organizationId, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled }),
      ...(query.postGroupId ? { postGroupId: query.postGroupId } : {}),
      ...(query.state ? { state: query.state } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
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
      docs: docs.map((row) => this.toDocument(row)),
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async findOneScoped(
    id: string,
    context: EngagementRuleScope,
  ): Promise<EngagementRuleDocument> {
    const row = await this.requireRow(id, context);
    return this.toDocument(row);
  }

  async updateScoped(
    id: string,
    dto: UpdateEngagementRuleDto,
    context: EngagementRuleScope,
  ): Promise<EngagementRuleDocument> {
    const existing = await this.requireRow(id, context);
    const input = parseUpdateEngagementRuleInput(dto);
    const isDisabling = input.isEnabled === false;
    const updated = await this.delegate().update({
      data: {
        ...(input.actionPayload === undefined
          ? {}
          : { actionPayload: toPrismaJson(input.actionPayload) }),
        ...(input.actionType === undefined
          ? {}
          : { actionType: input.actionType }),
        ...(input.brandId === undefined ? {} : { brandId: input.brandId }),
        ...(input.isEnabled === undefined
          ? {}
          : { isEnabled: input.isEnabled }),
        ...(input.metric === undefined ? {} : { metric: input.metric }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        ...(input.threshold === undefined
          ? {}
          : { threshold: input.threshold }),
        ...(input.windowEndsAt === undefined
          ? {}
          : {
              windowEndsAt: input.windowEndsAt
                ? new Date(input.windowEndsAt)
                : null,
            }),
        ...(isDisabling ? { state: EngagementRuleState.DISABLED } : {}),
      },
      where: scopedWhere(context.organizationId, { id: existing.id }),
    });
    return this.toDocument(updated);
  }

  async removeScoped(id: string, context: EngagementRuleScope): Promise<void> {
    const existing = await this.requireRow(id, context);
    await this.delegate().update({
      data: { isDeleted: true },
      where: scopedWhere(context.organizationId, { id: existing.id }),
    });
  }

  private async assertTargetExists(
    organizationId: string,
    postGroupId: string,
    targetId: string,
  ): Promise<void> {
    const target = await this.prisma.post.findFirst({
      where: scopedWhere(organizationId, {
        groupId: postGroupId,
        id: targetId,
      }),
      select: { id: true },
    });
    if (!target) {
      throw new BadRequestException(
        'Engagement rules require a release target in this organization.',
      );
    }
  }

  private async requireRow(
    id: string,
    context: EngagementRuleScope,
  ): Promise<StoredEngagementRuleRow> {
    if (!context.organizationId) {
      throw new BadRequestException('Organization context is required');
    }
    const row = await this.delegate().findFirst({
      where: scopedWhere(context.organizationId, { id }),
    });
    if (!row) {
      throw new NotFoundException('Engagement rule', id);
    }
    return row as StoredEngagementRuleRow;
  }

  private toDocument(row: StoredEngagementRuleRow): EngagementRuleDocument {
    return {
      actionPayload: parseActionPayload(row.actionPayload),
      actionType: parseStoredEngagementRuleAction(row.actionType),
      brandId: row.brandId,
      createdAt: row.createdAt,
      id: row.id,
      isDeleted: row.isDeleted,
      isEnabled: row.isEnabled,
      lastError: row.lastError,
      metric: parseStoredEngagementMetric(row.metric),
      metricSnapshot: parseMetricSnapshot(row.metricSnapshot),
      mode: parseStoredEngagementRuleMode(row.mode),
      organizationId: row.organizationId,
      postGroupId: row.postGroupId,
      resultingReleaseId: row.resultingReleaseId,
      state: parseStoredEngagementRuleState(row.state),
      targetId: row.targetId,
      threshold: row.threshold,
      triggeredAt: row.triggeredAt,
      updatedAt: row.updatedAt,
      userId: row.userId,
      windowEndsAt: row.windowEndsAt,
    };
  }

  private delegate() {
    return this.prisma.engagementRule;
  }
}
