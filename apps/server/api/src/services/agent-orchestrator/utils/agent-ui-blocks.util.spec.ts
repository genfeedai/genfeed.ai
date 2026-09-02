import { normalizeUiBlocks } from '@api/services/agent-orchestrator/utils/agent-ui-blocks.util';

describe('normalizeUiBlocks', () => {
  it('keeps object blocks and drops non-objects', () => {
    const blocks = normalizeUiBlocks([
      { id: 'a', type: 'text' },
      null,
      'skip',
      42,
      { id: 'b', type: 'chart' },
      undefined,
    ]);

    expect(blocks).toEqual([
      { id: 'a', type: 'text' },
      { id: 'b', type: 'chart' },
    ]);
  });

  it('returns empty for empty input', () => {
    expect(normalizeUiBlocks([])).toEqual([]);
  });
});
