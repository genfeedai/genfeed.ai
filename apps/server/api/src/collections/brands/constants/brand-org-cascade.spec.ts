import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDITOR_IGNORED_TABLES,
  FIRST_ORDER_TARGETS,
  KNOWN_EXCLUDED_MODELS,
  SECOND_ORDER_TARGETS,
} from '@api/collections/brands/constants/brand-org-cascade.constants';
import { describe, expect, it } from 'vitest';

/**
 * Staleness guard: the brand→org relocation cascade hardcodes which tables carry a
 * denormalized `organizationId` alongside a brand key. If a new dual-keyed model is
 * added to the schema, this test fails until it is either added to
 * FIRST_ORDER_TARGETS or explicitly excluded — preventing a silent tenancy
 * split-brain on the next brand move.
 */

const BRAND_FIELD_RE = /brandId$/i;
const ORG_FIELD_RE = /(organizationId|OrgId)$/i;
const SCALAR_TYPE_RE =
  /^(String|Int|BigInt|Float|Decimal|Boolean|DateTime|Json|Bytes)$/;

function findSchemaPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, 'packages/prisma/prisma/schema.prisma');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error('Could not locate packages/prisma/prisma/schema.prisma');
}

interface ParsedModel {
  name: string;
  brandFields: string[];
  orgFields: string[];
}

function parseDualKeyedModels(schema: string): ParsedModel[] {
  const lines = schema.split('\n');
  const models: ParsedModel[] = [];
  let current: {
    name: string;
    brandFields: string[];
    orgFields: string[];
  } | null = null;

  for (const rawLine of lines) {
    const modelMatch = rawLine.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      current = { name: modelMatch[1], brandFields: [], orgFields: [] };
      continue;
    }
    if (current && /^\}/.test(rawLine)) {
      if (current.brandFields.length > 0 && current.orgFields.length > 0) {
        models.push(current);
      }
      current = null;
      continue;
    }
    if (!current) {
      continue;
    }
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('@@')) {
      continue;
    }
    const fieldMatch = line.match(/^(\w+)\s+([\w[\]?.]+)/);
    if (!fieldMatch) {
      continue;
    }
    const [, fieldName, fieldType] = fieldMatch;
    const baseType = fieldType.replace(/[[\]?]/g, '');
    if (!SCALAR_TYPE_RE.test(baseType)) {
      continue;
    }
    if (BRAND_FIELD_RE.test(fieldName)) {
      current.brandFields.push(fieldName);
    }
    if (ORG_FIELD_RE.test(fieldName)) {
      current.orgFields.push(fieldName);
    }
  }

  return models;
}

describe('brand-org-cascade config', () => {
  it.each([
    ['CrunGenerationTask', 'crunGenerationTask', 'crun_generation_tasks'],
    [
      'BrandedGenerationReceipt',
      'brandedGenerationReceipt',
      'branded_generation_receipts',
    ],
    [
      'BrandedGenerationReceiptEvent',
      'brandedGenerationReceiptEvent',
      'branded_generation_receipt_events',
    ],
  ])(
    'excludes immutable %s history from every relocation mutation list',
    (model, delegate, table) => {
      expect(KNOWN_EXCLUDED_MODELS).toContain(model);
      expect(AUDITOR_IGNORED_TABLES).toContain(table);
      expect(
        FIRST_ORDER_TARGETS.some((target) => target.delegate === delegate),
      ).toBe(false);
      expect(
        SECOND_ORDER_TARGETS.some((target) => target.delegate === delegate),
      ).toBe(false);
    },
  );

  it('moves outlier snapshot ownership before measurements without moving org configuration', () => {
    const parent = FIRST_ORDER_TARGETS.findIndex(
      (target) => target.delegate === 'outlierBaselineSnapshot',
    );
    const child = FIRST_ORDER_TARGETS.findIndex(
      (target) => target.delegate === 'outlierPostPerformance',
    );
    expect(parent).toBeGreaterThanOrEqual(0);
    expect(child).toBeGreaterThan(parent);
    expect(FIRST_ORDER_TARGETS[parent]).toMatchObject({
      table: 'outlier_baseline_snapshots',
      brandField: 'brandId',
      orgField: 'organizationId',
    });
    expect(FIRST_ORDER_TARGETS[child]).toMatchObject({
      table: 'outlier_post_performances',
      brandField: 'brandId',
      orgField: 'organizationId',
    });
    expect(
      FIRST_ORDER_TARGETS.some(
        (target) => target.delegate === 'outlierConfiguration',
      ),
    ).toBe(false);
  });

  const schema = readFileSync(findSchemaPath(), 'utf8');
  const dualKeyed = parseDualKeyedModels(schema);

  // Map delegate name back to a model name (camelCase → PascalCase) for coverage checks.
  const coveredDelegates = new Set(FIRST_ORDER_TARGETS.map((t) => t.delegate));
  const excluded = new Set(KNOWN_EXCLUDED_MODELS);
  const delegateOf = (model: string): string =>
    model.charAt(0).toLowerCase() + model.slice(1);

  it('finds dual-keyed models in the schema (sanity)', () => {
    // If this ever hits zero, the parser broke — not the config.
    expect(dualKeyed.length).toBeGreaterThan(40);
  });

  it('covers or explicitly excludes every dual-keyed model', () => {
    const uncovered = dualKeyed
      .map((m) => m.name)
      .filter(
        (name) =>
          !coveredDelegates.has(delegateOf(name)) && !excluded.has(name),
      );

    expect(
      uncovered,
      `New dual-keyed model(s) found in schema.prisma with no cascade handling: ` +
        `${uncovered.join(', ')}. Add each to FIRST_ORDER_TARGETS (with the correct ` +
        `brand/org field pairing) or to KNOWN_EXCLUDED_MODELS in ` +
        `brand-org-cascade.constants.ts.`,
    ).toEqual([]);
  });

  it('every first-order target names fields that exist on its model', () => {
    const byDelegate = new Map(dualKeyed.map((m) => [delegateOf(m.name), m]));
    for (const target of FIRST_ORDER_TARGETS) {
      const model = byDelegate.get(target.delegate);
      expect(
        model,
        `no schema model for delegate ${target.delegate}`,
      ).toBeDefined();
      if (!model) {
        continue;
      }
      expect(
        model.brandFields,
        `${target.delegate}.${target.brandField} not a brand scalar`,
      ).toContain(target.brandField);
      expect(
        model.orgFields,
        `${target.delegate}.${target.orgField} not an org scalar`,
      ).toContain(target.orgField);
    }
  });

  it('has no duplicate first-order delegates', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const t of FIRST_ORDER_TARGETS) {
      if (seen.has(t.delegate)) {
        dupes.push(t.delegate);
      }
      seen.add(t.delegate);
    }
    expect(dupes).toEqual([]);
  });

  it('second-order targets do not overlap first-order delegates', () => {
    const overlap = SECOND_ORDER_TARGETS.filter((s) =>
      coveredDelegates.has(s.delegate),
    ).map((s) => s.delegate);
    expect(overlap).toEqual([]);
  });

  describe('org-only children of moved parents (#6689)', () => {
    const models = parseModels(schema);
    const byName = new Map(models.map((model) => [model.name, model]));
    const pascal = (delegate: string): string =>
      delegate.charAt(0).toUpperCase() + delegate.slice(1);
    const movedModels = new Set([
      'Brand',
      ...FIRST_ORDER_TARGETS.map((target) => pascal(target.delegate)),
      ...SECOND_ORDER_TARGETS.map((target) => pascal(target.delegate)),
    ]);

    it('configures, excludes, or composite-keys every model that holds an organization and points at a moved parent', () => {
      const unhandled = findUnhandledOrgOnlyChildren(
        models,
        movedModels,
        excluded,
      );

      expect(
        unhandled,
        `Org-only child model(s) with a foreign key to a brand-moved parent and no ` +
          `handling: ${unhandled.join(', ')}. Their organization id would stay on the ` +
          `source organization when the brand moves. Add each to SECOND_ORDER_TARGETS ` +
          `(keyed by its parent FK), or to KNOWN_EXCLUDED_MODELS and ` +
          `AUDITOR_IGNORED_TABLES with a reason.`,
      ).toEqual([]);
    });

    it('would catch an org-only child that nobody configured', () => {
      const withoutVersions = new Set(
        [...movedModels].filter((name) => name !== 'WorkflowVersion'),
      );
      const withoutClaims = new Set(
        [...movedModels].filter(
          (name) => name !== 'WorkflowExecutionNodeResult',
        ),
      );

      expect(
        findUnhandledOrgOnlyChildren(models, withoutVersions, excluded),
      ).toContain('WorkflowVersion.workflowId -> Workflow');
      expect(
        findUnhandledOrgOnlyChildren(models, withoutClaims, excluded),
      ).toContain(
        'WorkflowExecutionNodeResult.executionId -> WorkflowExecution',
      );
      expect(
        findUnhandledOrgOnlyChildren(
          models,
          movedModels,
          new Set([...excluded].filter((name) => name !== 'PersonaGrant')),
        ),
      ).toContain('PersonaGrant.personaId -> Persona');
    });

    it('names a real table, organization field and parent foreign key for every second-order target', () => {
      for (const target of SECOND_ORDER_TARGETS) {
        const model = byName.get(pascal(target.delegate));
        expect(model, `no model for ${target.delegate}`).toBeDefined();
        if (!model) continue;
        expect(model.table, `${target.delegate} table`).toBe(target.table);
        expect(
          model.scalars,
          `${target.delegate}.${target.orgField}`,
        ).toContain(target.orgField);
        expect(target.parents.length).toBeGreaterThan(0);
        for (const parent of target.parents) {
          expect(
            model.scalars,
            `${target.delegate}.${parent.fkField}`,
          ).toContain(parent.fkField);
          const parentModel = byName.get(pascal(parent.parentDelegate));
          expect(
            parentModel,
            `no parent model ${parent.parentDelegate}`,
          ).toBeDefined();
          if (!parentModel) continue;
          // The parent holds the brand scalar itself, or reaches it through one
          // relation (an execution through its workflow).
          const brandHolder = parent.parentRelation
            ? byName.get(
                parentModel.relations.find(
                  (relation) => relation.field === parent.parentRelation,
                )?.type ?? '',
              )
            : parentModel;
          expect(
            brandHolder,
            `${parent.parentDelegate}.${parent.parentRelation ?? '(self)'} is not a relation`,
          ).toBeDefined();
          expect(
            brandHolder?.scalars,
            `${parent.parentDelegate} brand field ${parent.parentBrandField}`,
          ).toContain(parent.parentBrandField);
          // Nothing else moves a parent that is not itself a moved model.
          expect(
            movedModels.has(parentModel.name),
            `${parentModel.name} is not a moved parent`,
          ).toBe(true);
        }
      }
    });

    it('keeps every first-order table name in step with the schema', () => {
      for (const target of FIRST_ORDER_TARGETS) {
        expect(
          byName.get(pascal(target.delegate))?.table,
          target.delegate,
        ).toBe(target.table);
      }
    });

    it('lists the table of every excluded model so the runtime auditor leaves it alone', () => {
      const missing = KNOWN_EXCLUDED_MODELS.flatMap((name) => {
        const model = byName.get(name);
        if (!model) return [`${name} (no such model)`];
        return AUDITOR_IGNORED_TABLES.includes(model.table)
          ? []
          : [`${name} -> ${model.table}`];
      });

      expect(missing).toEqual([]);
    });

    it('never both excludes and moves a model', () => {
      expect(
        KNOWN_EXCLUDED_MODELS.filter((name) => movedModels.has(name)),
      ).toEqual([]);
    });
  });
});

interface ParsedSchemaModel {
  name: string;
  table: string;
  scalars: string[];
  relations: Array<{ field: string; type: string; fields: string[] }>;
}

/** Every model with its table, scalar fields, and relations that own a foreign key. */
function parseModels(schema: string): ParsedSchemaModel[] {
  const models: ParsedSchemaModel[] = [];
  let current: ParsedSchemaModel | null = null;
  for (const rawLine of schema.split('\n')) {
    const modelMatch = rawLine.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      current = {
        name: modelMatch[1],
        relations: [],
        scalars: [],
        table: modelMatch[1],
      };
      continue;
    }
    if (current && /^\}/.test(rawLine)) {
      models.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const line = rawLine.trim();
    const mapMatch = line.match(/^@@map\("([^"]+)"\)/);
    if (mapMatch) {
      current.table = mapMatch[1];
      continue;
    }
    if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
    const fieldMatch = line.match(/^(\w+)\s+([\w[\]?.]+)/);
    if (!fieldMatch) continue;
    const [, field, rawType] = fieldMatch;
    const type = rawType.replace(/[[\]?]/g, '');
    if (SCALAR_TYPE_RE.test(type)) {
      current.scalars.push(field);
    }
    const relationMatch = line.match(/@relation\((.*)\)/);
    const foreignKeys = relationMatch?.[1].match(/fields:\s*\[([^\]]*)\]/);
    if (foreignKeys) {
      current.relations.push({
        field,
        fields: foreignKeys[1].split(',').map((name) => name.trim()),
        type,
      });
    }
  }
  return models;
}

/**
 * Models that carry an organization column and a foreign key to a moved parent
 * but are neither moved, excluded, nor keyed to the organization by a composite
 * foreign key (which cascades it with the parent). Each would keep the source
 * organization when its parent moves.
 */
function findUnhandledOrgOnlyChildren(
  models: readonly ParsedSchemaModel[],
  movedModels: ReadonlySet<string>,
  excludedModels: ReadonlySet<string>,
): string[] {
  return models
    .filter(
      (model) =>
        !movedModels.has(model.name) && !excludedModels.has(model.name),
    )
    .flatMap((model) => {
      const orgFields = model.scalars.filter((field) =>
        ORG_FIELD_RE.test(field),
      );
      if (orgFields.length === 0) return [];
      const isOrgKeyedByCompositeFk = model.relations.some(
        (relation) =>
          relation.fields.length > 1 &&
          relation.fields.some((field) => orgFields.includes(field)),
      );
      if (isOrgKeyedByCompositeFk) return [];
      return model.relations
        .filter(
          (relation) =>
            movedModels.has(relation.type) &&
            !relation.fields.some((field) => orgFields.includes(field)),
        )
        .map(
          (relation) =>
            `${model.name}.${relation.fields.join('+')} -> ${relation.type}`,
        );
    });
}
