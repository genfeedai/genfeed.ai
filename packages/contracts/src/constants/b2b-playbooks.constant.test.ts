import { describe, expect, it } from 'vitest';
import {
  b2bPlaybookFormats,
  b2bPlaybookSchema,
} from '../api-types/contracts/b2b-playbook.contract';
import {
  B2bPlaybookCompileError,
  type B2bPlaybookCompileErrorCode,
  type CompileB2bPlaybookInput,
  compileB2bPlaybook,
} from './b2b-playbook-compiler';
import { B2B_PLAYBOOKS } from './b2b-playbooks.constant';
import { MODEL_OUTPUT_CAPABILITIES } from './model-capabilities.constant';
import { getModelMaxReferences } from './model-helpers.constant';

function compileError(
  run: () => unknown,
): B2bPlaybookCompileErrorCode | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof B2bPlaybookCompileError ? error.code : undefined;
  }
  return undefined;
}

describe('B2B playbook catalog', () => {
  it('seeds one valid playbook per B2B format with unique keys', () => {
    expect(B2B_PLAYBOOKS.map((playbook) => playbook.format)).toEqual([
      ...b2bPlaybookFormats,
    ]);
    expect(new Set(B2B_PLAYBOOKS.map((playbook) => playbook.key)).size).toBe(
      B2B_PLAYBOOKS.length,
    );
    for (const playbook of B2B_PLAYBOOKS) {
      expect(b2bPlaybookSchema.safeParse(playbook).success, playbook.key).toBe(
        true,
      );
    }
  });

  it('allows only models that exist and can carry its reference slots', () => {
    for (const playbook of B2B_PLAYBOOKS) {
      for (const model of playbook.allowedModels) {
        expect(
          MODEL_OUTPUT_CAPABILITIES[model],
          `${playbook.key} ${model}`,
        ).toBeDefined();
        const imageSlots = playbook.referenceSlots.filter(
          (slot) => slot.kind === 'image',
        ).length;
        expect(
          getModelMaxReferences(model),
          `${model} must take ${imageSlots} image references for ${playbook.key}`,
        ).toBeGreaterThanOrEqual(imageSlots);
      }
    }
  });

  it('never defaults a slot to third-party media', () => {
    for (const playbook of B2B_PLAYBOOKS) {
      for (const slot of playbook.referenceSlots) {
        expect(['brand-scan', 'library']).toContain(slot.defaultSource);
      }
    }
  });
});

describe('compileB2bPlaybook', () => {
  const explainer = B2B_PLAYBOOKS[0];
  const model = explainer.allowedModels[0];
  const base = {
    attachments: [{ kind: 'image', slotKey: 'product-frame' }] as const,
    model,
    playbook: explainer,
    topic: 'Schedule a month of posts in one sitting',
  };

  it('compiles roles into numbered tokens and keeps shots in order', () => {
    const result = compileB2bPlaybook({
      ...base,
      attachments: [
        { kind: 'image', slotKey: 'brand-logo' },
        { kind: 'image', slotKey: 'product-frame' },
      ],
      brandName: 'Genfeed',
      patternHooks: [
        '  Stop posting on Mondays  ',
        '',
        'Ship the clip, not the deck',
      ],
    });
    expect(result.referenceRoles).toEqual([
      { role: 'brand_logo', slotKey: 'brand-logo', token: '@Image1' },
      { role: 'product_frame', slotKey: 'product-frame', token: '@Image2' },
    ]);
    expect(result.prompt).toContain(
      '@Image1: brand_logo\n@Image2: product_frame',
    );
    expect(result.prompt).toContain('Product explainer clip for Genfeed');
    expect(result.prompt).toContain(
      '- Stop posting on Mondays\n- Ship the clip, not the deck',
    );
    expect(result.prompt.indexOf('1. Problem')).toBeLessThan(
      result.prompt.indexOf('2. Resolve'),
    );
    expect(result).toMatchObject({
      aspectRatio: '16:9',
      durationSeconds: 10,
      mediaType: 'video',
    });
  });

  it.each<[B2bPlaybookCompileErrorCode, Partial<CompileB2bPlaybookInput>]>([
    ['MODEL_NOT_ALLOWED', { model: 'unreviewed/model' }],
    ['MISSING_REQUIRED_SLOT', { attachments: [] }],
    [
      'INVALID_ATTACHMENT',
      { attachments: [{ kind: 'image', slotKey: 'no-such-slot' }] },
    ],
  ])('rejects with %s', (code, patch) => {
    expect(compileError(() => compileB2bPlaybook({ ...base, ...patch }))).toBe(
      code,
    );
  });

  it('rejects a slot filled twice or with the wrong media kind', () => {
    expect(
      compileError(() =>
        compileB2bPlaybook({
          ...base,
          attachments: [
            { kind: 'image', slotKey: 'product-frame' },
            { kind: 'image', slotKey: 'product-frame' },
          ],
        }),
      ),
    ).toBe('INVALID_ATTACHMENT');
    expect(
      compileError(() =>
        compileB2bPlaybook({
          ...base,
          attachments: [{ kind: 'video', slotKey: 'product-frame' }],
        }),
      ),
    ).toBe('INVALID_ATTACHMENT');
  });

  it('rejects a playbook an admin edit left invalid', () => {
    expect(
      compileError(() =>
        compileB2bPlaybook({
          ...base,
          playbook: { ...explainer, shots: [] },
        }),
      ),
    ).toBe('INVALID_PLAYBOOK');
  });
});
