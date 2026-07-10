#!/usr/bin/env node
/**
 * Regenerates `src/enum-field-map.ts` (PRISMA_MODEL_METADATA) from
 * `prisma/schema.prisma`.
 *
 * BaseService relies on this static map for `modelHasField()` and enum
 * app-form → Prisma-form normalization, because the PrismaPg driver adapter
 * does not populate `_runtimeDataModel` under Prisma 7. The map therefore has
 * to be kept in lock-step with the schema — a stale entry silently drops
 * `isDeleted`/`OR` clauses from generated `where` filters (soft-delete bypass)
 * and skips enum normalization.
 *
 * Wired into `db:generate` so it regenerates (and biome-formats) on every
 * `prisma generate`. The `check:model-metadata` script re-runs the same
 * pipeline and `git diff --exit-code`s the result, failing CI when the
 * committed file has drifted from the schema.
 *
 * Rules (match the historical hand-maintained shape):
 *   - allFields: every scalar, enum, FK, and single-object relation field.
 *     List fields (`Type[]`) — relation lists and scalar lists — are excluded.
 *   - enumFields: fields whose (non-list) type is a Prisma enum, with the
 *     enum type name and whether the column is required (no `?`).
 *   - Keys (models + fields) sorted alphabetically for a stable diff.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(HERE, '../prisma/schema.prisma');
const OUT = resolve(HERE, '../src/enum-field-map.ts');

const HEADER = `/**
 * GENERATED — do not edit by hand.
 * Source: packages/prisma/prisma/schema.prisma
 * Regenerate: \`cd packages/prisma && bun run db:generate\`
 *
 * Static model/field metadata for BaseService enum normalisation.
 * Replaces runtime \`_runtimeDataModel\` lookup which is not populated
 * by the PrismaPg driver adapter under Prisma 7.
 */

/** Per-field enum metadata (used by BaseService). */
export interface EnumFieldMeta {
  /** Prisma enum type name, e.g. "IngredientCategory". */
  enumType: string;
  /** True when the column is NOT NULL in the schema. */
  isRequired: boolean;
}

/** Per-model field metadata. */
export interface ModelFieldMeta {
  /**
   * All scalar + enum field names present on the model.
   * Does NOT include list fields (relations or scalars).
   * Used by modelHasField().
   */
  allFields: ReadonlyArray<string>;
  /**
   * Enum fields: fieldName -> EnumFieldMeta.
   * Only fields whose type is a Prisma enum appear here.
   */
  enumFields: Readonly<Record<string, EnumFieldMeta>>;
}

/**
 * Complete model metadata map.
 * Key = PascalCase model name matching Prisma.ModelName.
 */
`;

const FOOTER = `
/**
 * Returns model metadata for a given model name (camelCase or PascalCase).
 * Returns undefined when the model is not in the schema.
 */
export function getModelMeta(modelName: string): ModelFieldMeta | undefined {
  const pascal = modelName.charAt(0).toUpperCase() + modelName.slice(1);
  return PRISMA_MODEL_METADATA[pascal];
}
`;

function build() {
  const schema = readFileSync(SCHEMA, 'utf8');

  const enumNames = new Set(
    [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]),
  );

  const models = {};
  for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = m;
    const allFields = new Set();
    const enumFields = {};
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (
        line === '' ||
        line.startsWith('//') ||
        line.startsWith('@@') ||
        line.startsWith('/*') ||
        line.startsWith('*')
      ) {
        continue;
      }
      const fm = line.match(/^(\w+)\s+([A-Za-z0-9_]+)\s*(\[\]|\?)?/);
      if (!fm) continue;
      const [, fname, baseType, suffix] = fm;
      if (suffix === '[]') continue; // list relation / scalar list — excluded
      allFields.add(fname);
      if (enumNames.has(baseType)) {
        enumFields[fname] = { enumType: baseType, isRequired: suffix !== '?' };
      }
    }
    models[name] = { allFields: [...allFields].sort(), enumFields };
  }

  const entries = Object.keys(models)
    .sort()
    .map((name) => {
      const { allFields, enumFields } = models[name];
      const af = allFields.map((f) => `      '${f}',`).join('\n');
      const enumKeys = Object.keys(enumFields).sort();
      const ef =
        enumKeys.length === 0
          ? '    enumFields: {},'
          : `    enumFields: {\n${enumKeys
              .map(
                (k) =>
                  `      ${k}: { enumType: '${enumFields[k].enumType}', isRequired: ${enumFields[k].isRequired} },`,
              )
              .join('\n')}\n    },`;
      return `  ${name}: {\n    allFields: [\n${af}\n    ],\n${ef}\n  },`;
    })
    .join('\n');

  return `${HEADER}export const PRISMA_MODEL_METADATA: Readonly<Record<string, ModelFieldMeta>> = {
${entries}
};
${FOOTER}`;
}

const next = build();
writeFileSync(OUT, next);
const modelCount = (next.match(/^ {2}\w+: \{$/gm) || []).length;
console.log(`Wrote ${OUT} (${modelCount} models).`);
