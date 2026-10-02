import {
  type BrandedGenerationJsonV1,
  canonicalizeBrandedGenerationJsonV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import {
  brandGenerationDiagnosticSchema,
  brandGenerationLayerReceiptV1Schema,
  brandLearningApplicationV1Schema,
  learningContractIdSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LEARNING_ARMS, learningContribution } from '@genfeedai/harness';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const MAX_BYTES = 2097152;
const MAX_NODES = 262144;
const contributionFields = [
  'systemDirectives',
  'styleDirectives',
  'guardrails',
  'evaluationCriteria',
  'providerHints',
  'sources',
] as const;
function invalid(): never {
  throw new BadRequestException('compiler_recipe_invalid');
}
function limit(): never {
  throw new BadRequestException('compiler_recipe_limit');
}
function boundedString(value: string, maximum: number, utf8: boolean): boolean {
  if ((utf8 ? Buffer.byteLength(value, 'utf8') : value.length) > maximum)
    limit();
  return true;
}
const sectionSchema = z.strictObject({
  header: z.string().refine((value) => boundedString(value, 512, false)),
  content: z.string().refine((value) => boundedString(value, 65536, true)),
  instructions: z
    .string()
    .refine((value) => boundedString(value, 65536, true))
    .optional(),
  untrusted: z.boolean(),
  isAtomic: z.literal(true),
});
const stageSchema = z
  .tuple([
    brandGenerationLayerReceiptV1Schema,
    z.array(sectionSchema),
    z.array(
      z.array(learningContractIdSchema).refine((ids) => {
        if (ids.length > 256) limit();
        return new Set(ids).size === ids.length;
      }),
    ),
  ])
  .refine(([layer, sections, rows]) => {
    if (
      !['skill', 'knowledge', 'harness_profile', 'pack'].includes(layer.kind) ||
      !['not_applicable', 'unavailable'].includes(layer.status)
    )
      return false;
    if (layer.status === 'unavailable' && (sections.length || rows.length))
      return false;
    return (
      (!sections.length || Boolean(layer.id)) && rows.length === sections.length
    );
  });
const contributionSchema = z
  .strictObject({
    systemDirectives: z.array(z.string()).optional(),
    styleDirectives: z.array(z.string()).optional(),
    guardrails: z.array(z.string()).optional(),
    evaluationCriteria: z.array(z.string()).optional(),
    providerHints: z.array(z.string()).optional(),
    sources: z.array(z.never()).optional(),
  })
  .refine(
    (value) =>
      LEARNING_ARMS.filter((arm) => {
        const actual = learningContribution(arm);
        return contributionFields.every((field) => {
          const supplied = value[field] ?? [];
          const expected = actual[field] ?? [];
          return (
            supplied.length === expected.length &&
            supplied.every((entry, index) => entry === expected[index])
          );
        });
      }).length === 1,
  );
const recipeSchema: z.ZodType<BrandedGenerationCompilerRecipeV1> = z
  .tuple([
    z.literal('snapshot-brief-v1'),
    z.array(stageSchema),
    z.array(stageSchema),
    z.array(brandGenerationDiagnosticSchema),
    brandLearningApplicationV1Schema,
    contributionSchema,
  ])
  .refine(([, required, optional, diagnostics]) => {
    if (required.length + optional.length > 256 || diagnostics.length > 128)
      limit();
    const stages = [...required, ...optional];
    if (
      stages.reduce((count, [, sections]) => count + sections.length, 0) > 256
    )
      limit();
    if (
      required.some(([layer]) => !['skill', 'knowledge'].includes(layer.kind))
    )
      return false;
    const identities = new Set<string>();
    for (const [layer] of stages) {
      if (layer.id === undefined) continue;
      const identity = `${layer.kind}\0${layer.id}`;
      if (identities.has(identity)) return false;
      identities.add(identity);
    }
    return true;
  });

function detach(
  value: unknown,
  allowObjectUndefined: boolean,
  omitUndefined: boolean,
): unknown {
  let nodes = 0;
  let bytes = 0;
  const ancestors = new Set<object>();
  const add = (count: number) => {
    bytes += count;
    if (bytes > MAX_BYTES) limit();
  };
  const stringBytes = (text: string) => {
    if (text.length > MAX_BYTES) limit();
    add(2);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code))
        add(2);
      else if (code < 32) add(6);
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          add(4);
          index += 1;
        } else add(6);
      } else if (code >= 0xdc00 && code <= 0xdfff) add(6);
      else add(code < 128 ? 1 : code < 2048 ? 2 : 3);
    }
  };
  const visit = (
    current: unknown,
    depth: number,
    objectField = false,
  ): unknown => {
    nodes += 1;
    if (nodes > MAX_NODES || depth > 16) limit();
    if (current === undefined) {
      if (!allowObjectUndefined || !objectField) invalid();
      return undefined;
    }
    if (typeof current === 'string') {
      stringBytes(current);
      return current;
    }
    if (current === null || typeof current === 'boolean') {
      add(current === null ? 4 : current ? 4 : 5);
      return current;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) invalid();
      add(JSON.stringify(current).length);
      return current;
    }
    if (
      typeof current !== 'object' ||
      current === null ||
      ancestors.has(current)
    )
      invalid();
    const array = Array.isArray(current);
    const prototype = Object.getPrototypeOf(current);
    if (
      array
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      invalid();
    if (Object.getOwnPropertySymbols(current).length) invalid();
    let length = 0;
    if (array) {
      const descriptor = Object.getOwnPropertyDescriptor(current, 'length');
      if (
        !descriptor ||
        !('value' in descriptor) ||
        !Number.isSafeInteger(descriptor.value) ||
        descriptor.value < 0
      )
        invalid();
      length = descriptor.value;
      if (length > 65536) limit();
    }
    const descriptors = Object.getOwnPropertyDescriptors(current);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (key.length > MAX_BYTES) limit();
      if (
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        ['__proto__', 'constructor', 'prototype'].includes(key)
      )
        invalid();
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length))
        invalid();
    }
    if (array && Object.keys(descriptors).length !== length + 1) invalid();
    ancestors.add(current);
    try {
      add(2);
      if (array) {
        const result: unknown[] = [];
        for (let index = 0; index < length; index += 1) {
          if (index) add(1);
          result.push(visit(descriptors[String(index)].value, depth + 1));
        }
        return result;
      }
      const result: Record<string, unknown> = {};
      let emitted = 0;
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor.value === undefined && allowObjectUndefined) {
          visit(undefined, depth + 1, true);
          if (!omitUndefined) result[key] = undefined;
          continue;
        }
        if (emitted++) add(1);
        stringBytes(key);
        add(1);
        result[key] = visit(descriptor.value, depth + 1, true);
      }
      return result;
    } finally {
      ancestors.delete(current);
    }
  };
  return visit(value, 0);
}
function validate(
  value: unknown,
  encoding: boolean,
): BrandedGenerationCompilerRecipeV1 {
  try {
    return recipeSchema.parse(detach(value, encoding, false));
  } catch (error) {
    if (
      error instanceof BadRequestException &&
      error.message === 'compiler_recipe_limit'
    )
      throw error;
    invalid();
  }
}
export function parseBrandedGenerationCompilerRecipeV1(
  value: unknown,
): BrandedGenerationCompilerRecipeV1 {
  return validate(value, false);
}
export function encodeBrandedGenerationCompilerRecipeV1(
  recipe: BrandedGenerationCompilerRecipeV1,
): string {
  try {
    const parsed = validate(recipe, true);
    const json = canonicalizeBrandedGenerationJsonV1(
      detach(parsed, true, true) as BrandedGenerationJsonV1,
    );
    if (Buffer.byteLength(json, 'utf8') > MAX_BYTES) limit();
    return json;
  } catch (error) {
    if (
      error instanceof BadRequestException &&
      error.message === 'compiler_recipe_limit'
    )
      throw error;
    invalid();
  }
}
