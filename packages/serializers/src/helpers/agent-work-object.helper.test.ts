import { serializeAgentWorkObject } from '@serializers/helpers/agent-work-object.helper';
import { describe, expect, it } from 'vitest';

describe('canonical agent work serialization', () => {
  it('exposes Library content while withholding provider and review internals', () => {
    expect(
      serializeAgentWorkObject({
        providerData: {
          secret: 'private',
          agentWorkObject: {
            kind: 'script',
            title: 'Launch',
            body: 'The script',
            reviewToken: 'private',
            threadId: 'private',
          },
        },
      }),
    ).toEqual({ kind: 'script', title: 'Launch', body: 'The script' });
  });
  it('only exposes declared text cells', () => {
    expect(
      serializeAgentWorkObject({
        providerData: {
          agentWorkObject: {
            kind: 'table',
            title: 'Shots',
            columns: [{ key: 'shot', label: 'Shot' }],
            rows: [{ shot: 'Opening', secret: 'private' }],
          },
        },
      }),
    ).toEqual({
      kind: 'table',
      title: 'Shots',
      columns: [{ key: 'shot', label: 'Shot' }],
      rows: [{ shot: 'Opening' }],
    });
  });
  it('does not fabricate work content for regular ingredients', () => {
    expect(
      serializeAgentWorkObject({ providerData: { model: 'a' } }),
    ).toBeUndefined();
  });
});
