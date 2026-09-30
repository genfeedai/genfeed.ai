import { describe, expect, it } from 'vitest';
import { visualProjectData } from './visual-project.config';

describe('visual project serialization', () => {
  it('exposes saved history without executable source or private dispatch metadata', () => {
    const output = visualProjectData({
      id: 'project',
      label: 'Visual',
      requestId: 'private',
      revisions: [
        {
          id: 'revision',
          number: 1,
          sourceCode: 'untrusted source',
          reservationId: 'private-hold',
          workflowExecutionId: 'private-workflow',
          preview: [{ url: 'media.png' }],
          props: { title: 'hello' },
        },
      ],
    });
    const json = JSON.stringify(output);
    expect(json).not.toContain('untrusted source');
    expect(json).not.toContain('private-hold');
    expect(json).not.toContain('private-workflow');
    expect(json).toContain('hasSource');
    expect(json).toContain('media.png');
  });
});
