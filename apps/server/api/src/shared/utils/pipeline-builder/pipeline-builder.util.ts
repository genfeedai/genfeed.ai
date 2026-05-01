import type {
  MatchConditions,
  PrismaFindAllQuery,
  SortOrder,
} from '@api/shared/utils/pipeline-builder/pipeline-builder.types';

export class PipelineBuilder {
  private where: MatchConditions = {};
  private orderBy: Record<string, SortOrder> | undefined;

  static create(): PipelineBuilder {
    return new PipelineBuilder();
  }

  static buildMatch(conditions: MatchConditions): PrismaFindAllQuery {
    return { where: conditions };
  }

  static buildSort(sort: Record<string, SortOrder>): PrismaFindAllQuery {
    return { orderBy: sort };
  }

  static mergeMatches(conditions: MatchConditions[]): MatchConditions {
    return conditions.reduce<MatchConditions>(
      (acc, condition) => ({ ...acc, ...condition }),
      {},
    );
  }

  match(conditions: MatchConditions): this {
    this.where = PipelineBuilder.mergeMatches([this.where, conditions]);
    return this;
  }

  sort(sort: Record<string, SortOrder>): this {
    this.orderBy = sort;
    return this;
  }

  add(): this {
    return this;
  }

  build(): PrismaFindAllQuery {
    return {
      ...(this.orderBy ? { orderBy: this.orderBy } : {}),
      where: this.where,
    };
  }
}
