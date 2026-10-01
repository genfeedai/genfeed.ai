import { latestDisplayableEvaluationsQuery } from '@api/collections/evaluations/services/content-evaluation-projection.query';
import type {
  EvaluationReadScope,
  EvaluationReadTarget,
  ProjectedEvaluationItem,
} from '@api/collections/evaluations/services/content-evaluation-projection.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IEvaluation } from '@genfeedai/contracts/interfaces';
import { normalizePersuasionScores } from '@genfeedai/harness/contracts';
import { Injectable } from '@nestjs/common';

function persistedContentType(
  value: string | null | undefined,
): EvaluationReadTarget['contentType'] | null {
  if (!value) return null;
  switch (value.toLowerCase()) {
    case 'image':
      return IngredientCategory.IMAGE;
    case 'video':
      return IngredientCategory.VIDEO;
    case 'article':
      return 'article';
    case 'post':
      return 'post';
    default:
      return null;
  }
}

function targetKey(
  target: Pick<
    EvaluationReadTarget,
    'organizationId' | 'contentType' | 'contentId'
  >,
): string {
  return JSON.stringify([
    target.organizationId,
    target.contentType,
    target.contentId,
  ]);
}

@Injectable()
export class ContentEvaluationProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  private target(
    item: object,
    scope: EvaluationReadScope,
  ): EvaluationReadTarget | null {
    if (
      !('id' in item) ||
      typeof item.id !== 'string' ||
      !item.id ||
      !('organizationId' in item) ||
      typeof item.organizationId !== 'string' ||
      !item.organizationId ||
      ('isDeleted' in item && item.isDeleted)
    )
      return null;
    const category =
      'category' in item && typeof item.category === 'string'
        ? item.category
        : null;
    const contentType =
      persistedContentType(scope.contentType) ?? persistedContentType(category);
    if (!contentType) return null;
    return {
      organizationId: item.organizationId,
      contentType,
      contentId: item.id,
      brandId:
        'brandId' in item && typeof item.brandId === 'string'
          ? item.brandId
          : null,
      activeBrandId: scope.brandId ?? null,
    };
  }

  async attachToItems<T extends object>(
    items: readonly T[],
    scope: EvaluationReadScope,
  ): Promise<ProjectedEvaluationItem<T>[]> {
    const targets = new Map<string, EvaluationReadTarget>();
    for (const item of items) {
      const target = this.target(item, scope);
      if (target) targets.set(targetKey(target), target);
    }
    const rows = targets.size
      ? await this.prisma.$queryRaw<IEvaluation[]>(
          latestDisplayableEvaluationsQuery([...targets.values()]),
        )
      : [];
    const evaluations = new Map<string, IEvaluation>();
    for (const row of rows) {
      const data = { ...row.data };
      if (data.status === 'completed' && data.scores) {
        const scores = { ...data.scores };
        const persuasion = normalizePersuasionScores(scores.persuasion);
        delete scores.persuasion;
        if (persuasion) scores.persuasion = persuasion;
        data.scores = scores;
      }
      const contentType = persistedContentType(row.contentType);
      if (contentType && row.contentId)
        evaluations.set(
          targetKey({
            ...row,
            contentType,
            contentId: row.contentId,
          }),
          { ...row, data, contentType },
        );
    }
    return items.map((item) => {
      const target = this.target(item, scope);
      return {
        ...item,
        evaluation: target
          ? (evaluations.get(targetKey(target)) ?? null)
          : null,
      };
    });
  }

  async attachToItem<T extends object>(
    item: T,
    scope: EvaluationReadScope,
  ): Promise<ProjectedEvaluationItem<T>> {
    const [projected] = await this.attachToItems([item], scope);
    return projected;
  }

  async attachToPage<T extends object, P extends { docs: T[] }>(
    page: P,
    scope: EvaluationReadScope,
  ): Promise<P & { docs: ProjectedEvaluationItem<T>[] }> {
    return { ...page, docs: await this.attachToItems(page.docs, scope) };
  }
}
