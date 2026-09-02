import { customLabels } from './pagination.util';

describe('pagination util', () => {
  it('defines custom labels', () => {
    expect(customLabels.totalDocs).toBe('total');
    expect(customLabels.totalPages).toBe('pages');
  });
});
