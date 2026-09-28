import {
  MAX_FAVORITE_WORKFLOW_IDS,
  MAX_STORED_FAVORITE_WORKFLOW_IDS,
} from '@api/collections/settings/constants/favorite-workflows.constant';
import { CreateSettingDto } from '@api/collections/settings/dto/create-setting.dto';
import { UpdateSettingDto } from '@api/collections/settings/dto/update-setting.dto';
import type { SettingDocument } from '@api/collections/settings/schemas/setting.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type FavoriteWorkflowIdsCarrier = { favoriteWorkflowIds?: unknown };

function readFavoriteWorkflowIds(value: unknown): string[] | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const ids = (value as FavoriteWorkflowIdsCarrier).favoriteWorkflowIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string')
    : null;
}

@Injectable()
export class SettingsService extends BaseService<
  SettingDocument,
  CreateSettingDto,
  UpdateSettingDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'setting', logger);
  }

  /**
   * Rejects a favorites write unless every id is a non-deleted workflow of
   * the caller's organization. Runs before the settings patch, so an invalid
   * list is never partially stored.
   */
  async assertFavoriteWorkflowIds(
    favoriteWorkflowIds: readonly string[] | null,
    organizationId: string,
  ): Promise<void> {
    // Optional DTO fields admit null; the column is a list, so clearing
    // favorites must be an explicit empty array.
    if (!Array.isArray(favoriteWorkflowIds)) {
      throw new BadRequestException(
        'favoriteWorkflowIds must be an array; send [] to clear favorites',
      );
    }
    if (favoriteWorkflowIds.length > MAX_FAVORITE_WORKFLOW_IDS) {
      throw new BadRequestException(
        `favoriteWorkflowIds accepts at most ${MAX_FAVORITE_WORKFLOW_IDS} workflows`,
      );
    }
    if (new Set(favoriteWorkflowIds).size !== favoriteWorkflowIds.length) {
      throw new BadRequestException(
        'favoriteWorkflowIds must not contain duplicates',
      );
    }
    if (favoriteWorkflowIds.length === 0) {
      return;
    }
    if (!organizationId) {
      throw new BadRequestException(
        'favoriteWorkflowIds requires an active organization',
      );
    }

    const liveIds = await this.findLiveWorkflowIds(
      favoriteWorkflowIds,
      organizationId,
    );
    const unavailableIds = favoriteWorkflowIds.filter((id) => !liveIds.has(id));
    if (unavailableIds.length > 0) {
      throw new BadRequestException(
        `favoriteWorkflowIds contains workflows that are not available in this organization: ${unavailableIds.join(', ')}`,
      );
    }
  }

  /**
   * Returns the settings record with `favoriteWorkflowIds` narrowed to the
   * non-deleted workflows of the caller's organization, preserving order.
   * Favorites of workflows deleted since they were saved are dropped.
   */
  async withLiveFavoriteWorkflowIds<T extends object>(
    settings: T,
    organizationId: string,
  ): Promise<T> {
    const favoriteWorkflowIds = readFavoriteWorkflowIds(settings);
    if (favoriteWorkflowIds === null) {
      return settings;
    }

    const liveIds =
      favoriteWorkflowIds.length > 0 && organizationId
        ? await this.findLiveWorkflowIds(favoriteWorkflowIds, organizationId)
        : new Set<string>();

    return {
      ...settings,
      favoriteWorkflowIds: favoriteWorkflowIds.filter((id) => liveIds.has(id)),
    };
  }

  /**
   * Builds the list to persist for a favorites write that already passed
   * `assertFavoriteWorkflowIds`. The stored list spans every organization the
   * user belongs to, so a write replaces only the caller organization's subset:
   * `(stored ids not in the caller org) ∪ submittedIds`. Caller-org ids whose
   * workflow was since deleted are dropped with the rest of that subset.
   *
   * Other-org ids stay first and the submitted ids are appended, so the front
   * of the list holds the least recently written organizations. Beyond
   * `MAX_STORED_FAVORITE_WORKFLOW_IDS`, those oldest other-org ids are pruned.
   * Without an active organization there is no subset to replace, so the
   * stored list is kept.
   */
  async mergeFavoriteWorkflowIds(
    settingsId: string,
    submittedIds: readonly string[],
    organizationId: string,
  ): Promise<string[]> {
    const setting = await this.prisma.setting.findFirst({
      select: { favoriteWorkflowIds: true },
      where: { id: settingsId, isDeleted: false },
    });
    const storedIds = setting?.favoriteWorkflowIds ?? [];

    if (!organizationId) {
      return storedIds;
    }

    const organizationIds =
      storedIds.length > 0
        ? await this.findOrganizationWorkflowIds(storedIds, organizationId)
        : new Set<string>();
    const submitted = new Set(submittedIds);
    const otherOrganizationIds = storedIds.filter(
      (id) => !organizationIds.has(id) && !submitted.has(id),
    );
    const otherOrganizationCapacity = Math.max(
      0,
      MAX_STORED_FAVORITE_WORKFLOW_IDS - submittedIds.length,
    );

    return [
      ...otherOrganizationIds.slice(
        Math.max(0, otherOrganizationIds.length - otherOrganizationCapacity),
      ),
      ...submittedIds,
    ];
  }

  private async findLiveWorkflowIds(
    workflowIds: readonly string[],
    organizationId: string,
  ): Promise<Set<string>> {
    const rows = await this.prisma.workflow.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, { id: { in: [...workflowIds] } }),
    });
    return new Set(rows.map((row) => row.id));
  }

  /** Ids among `workflowIds` owned by the organization, deleted or not. */
  private async findOrganizationWorkflowIds(
    workflowIds: readonly string[],
    organizationId: string,
  ): Promise<Set<string>> {
    const [liveIds, deletedRows] = await Promise.all([
      this.findLiveWorkflowIds(workflowIds, organizationId),
      this.prisma.workflow.findMany({
        select: { id: true },
        where: scopedWhere(organizationId, {
          id: { in: [...workflowIds] },
          isDeleted: true,
        }),
      }),
    ]);
    for (const row of deletedRows) {
      liveIds.add(row.id);
    }
    return liveIds;
  }
}
