import { extractThreadOutputs } from '@genfeedai/agent/utils/extract-thread-outputs';
import { describe, expect, it } from 'vitest';

describe('extractThreadOutputs', () => {
  it('groups image and text variants under their originating ui action', () => {
    const outputs = extractThreadOutputs([
      {
        content: 'assistant',
        createdAt: '2026-03-20T10:00:00.000Z',
        id: 'message-1',
        metadata: {
          uiActions: [
            {
              description: 'Created variants for review',
              id: 'action-1',
              images: ['https://cdn.test/output-1.png'],
              title: 'Launch variants',
              tweets: ['Variant A copy'],
              type: 'content_preview_card',
            },
          ],
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ]);

    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({
      description: 'Created variants for review',
      id: 'message-1:action-1',
      title: 'Launch variants',
    });
    expect(outputs[0].variants).toHaveLength(2);
    expect(outputs[0].variants.map((variant) => variant.kind)).toEqual([
      'image',
      'text',
    ]);
  });

  it('creates a fallback output group from message-level media URLs', () => {
    const outputs = extractThreadOutputs([
      {
        content: 'assistant',
        createdAt: '2026-03-20T10:00:00.000Z',
        id: 'message-2',
        metadata: {
          mediaUrl: 'https://cdn.test/output-2.mp4',
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ]);

    expect(outputs).toHaveLength(1);
    expect(outputs[0].title).toBe('Generated media');
    expect(outputs[0].variants[0]).toMatchObject({
      kind: 'video',
      url: 'https://cdn.test/output-2.mp4',
    });
  });

  it('preserves format metadata for newsletter and social preview renderers', () => {
    const outputs = extractThreadOutputs([
      {
        content: 'assistant',
        createdAt: '2026-08-05T10:00:00.000Z',
        id: 'message-3',
        metadata: {
          uiActions: [
            {
              contentFormat: 'newsletter',
              id: 'newsletter-1',
              platform: 'newsletter',
              preheader: 'Three useful signals',
              subject: 'The weekly briefing',
              textContent: 'Newsletter body',
              title: 'Newsletter draft',
              type: 'content_preview_card',
            },
          ],
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ]);

    expect(outputs[0].variants[0]).toMatchObject({
      contentFormat: 'newsletter',
      platform: 'newsletter',
      preheader: 'Three useful signals',
      subject: 'The weekly briefing',
    });
  });

  it('uses completion summary output variants only when detailed outputs are absent', () => {
    const outputs = extractThreadOutputs([
      {
        content: 'assistant',
        createdAt: '2026-08-05T10:00:00.000Z',
        id: 'message-4',
        metadata: {
          uiActions: [
            {
              id: 'summary-1',
              outputVariants: [
                {
                  id: 'summary-image',
                  kind: 'image',
                  url: 'https://cdn.test/summary.png',
                },
              ],
              title: 'Done',
              type: 'completion_summary_card',
            },
          ],
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ]);

    expect(outputs).toHaveLength(1);
    expect(outputs[0].variants[0]).toMatchObject({
      kind: 'image',
      url: 'https://cdn.test/summary.png',
    });
  });
});
