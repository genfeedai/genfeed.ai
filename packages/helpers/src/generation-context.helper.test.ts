import {
  applyTaskContextToPrompt,
  assertSelectedContextLimits,
  buildGenerationContextReceipt,
  readSelectedGenerationContext,
  SELECTED_CONTEXT_MAX_TEXT_LENGTH,
} from './generation-context.helper';

describe('generation context helper', () => {
  it('rejects implicit persistence and oversized task text', () => {
    expect(
      assertSelectedContextLimits({ persist: true, text: 'keep this' }),
    ).toMatch(/capture_knowledge/);
    expect(
      assertSelectedContextLimits({
        text: 'x'.repeat(SELECTED_CONTEXT_MAX_TEXT_LENGTH + 1),
      }),
    ).toMatch(/exceeds/);
  });

  it('applies task text without creating a persistent source receipt', () => {
    const selected = readSelectedGenerationContext({
      sourceIds: ['src-1'],
      text: 'Use the second brand voice',
    });
    expect(applyTaskContextToPrompt('Make a poster', selected)).toContain(
      'Use the second brand voice',
    );
    const receipt = buildGenerationContextReceipt({
      brandId: 'brand-2',
      sourceIds: selected?.sourceIds,
      text: selected?.text,
    });
    expect(receipt.isPersisted).toBe(false);
    expect(receipt.sources).toEqual(
      expect.arrayContaining([
        { kind: 'task_text', title: 'Task context' },
        { id: 'src-1', kind: 'knowledge_source' },
        { id: 'brand-2', kind: 'brand' },
      ]),
    );
  });
});
