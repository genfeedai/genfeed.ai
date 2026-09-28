/**
 * Configuration for relation population / nested fetches.
 * Used across services that need to load related documents.
 */
export interface PopulateOption {
  path: string;
  select?: readonly string[];
  populate?: PopulateOption;
  /**
   * Prisma `where` for a to-many relation, e.g. `{ isDeleted: false }`.
   * Passed through unnormalized, so use the target model's persisted values.
   */
  where?: Readonly<Record<string, unknown>>;
}
