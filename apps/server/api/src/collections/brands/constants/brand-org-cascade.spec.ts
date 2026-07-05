import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FIRST_ORDER_TARGETS,
  KNOWN_EXCLUDED_MODELS,
  SECOND_ORDER_TARGETS,
} from './brand-org-cascade.constants';

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
});
