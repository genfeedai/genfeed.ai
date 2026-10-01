import type { EvaluationReadTarget } from '@api/collections/evaluations/services/content-evaluation-projection.types';
import { Prisma } from '@genfeedai/prisma';

/** Authorized parent targets, never request-provided evaluation IDs. */
export function latestDisplayableEvaluationsQuery(
  targets: readonly EvaluationReadTarget[],
): Prisma.Sql {
  const values = targets.map(
    (target) => Prisma.sql`(
    ${target.organizationId}::text, ${target.contentType}::text,
    ${target.contentId}::text, ${target.brandId}::text, ${target.activeBrandId}::text
  )`,
  );
  return Prisma.sql`
    WITH targets("organizationId", "contentType", "contentId", "brandId", "activeBrandId") AS (
      VALUES ${Prisma.join(values)}
    ), displayable AS (
      SELECT e.*, ROW_NUMBER() OVER (
        PARTITION BY e."organizationId", e."contentType", e."contentId"
        ORDER BY e."updatedAt" DESC, e."createdAt" DESC, e.id ASC
      ) AS position
      FROM evaluations e
      JOIN targets t ON e."organizationId" = t."organizationId"
        AND e."contentType" = t."contentType" AND e."contentId" = t."contentId"
      WHERE e."isDeleted" = false AND jsonb_typeof(e.data) = 'object'
        AND (
          (e.data ? 'brandId' AND jsonb_typeof(e.data->'brandId') = 'string'
            AND e.data->>'brandId' = COALESCE(t."brandId", t."activeBrandId"))
          OR (NOT (e.data ? 'brandId') AND t."brandId" IS NOT NULL
            AND t."brandId" = t."activeBrandId")
        )
        AND (
          e.data->>'status' IN ('processing', 'failed')
          OR (e.data->>'status' = 'completed'
            AND jsonb_typeof(e.data->'scores') = 'object'
            AND CASE WHEN jsonb_typeof(e.data->'overallScore') = 'number'
              THEN (e.data->>'overallScore')::numeric BETWEEN 0 AND 100
              ELSE false END)
        )
    )
    SELECT id, "organizationId", "userId", "contentType", "contentId", data,
      "isDeleted", "createdAt", "updatedAt"
    FROM displayable WHERE position = 1
  `;
}
