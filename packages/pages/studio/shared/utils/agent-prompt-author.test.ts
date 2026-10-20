import { resolveAgentPromptAuthor } from '@pages/studio/shared/utils/agent-prompt-author';
import { describe, expect, it } from 'vitest';

const draft = 'A 30-second product reveal for the spring drop.';

describe('resolveAgentPromptAuthor', () => {
  it('marks the draft sent unchanged as agent-authored', () => {
    expect(resolveAgentPromptAuthor(draft, ` ${draft} `)).toBe('agent');
  });

  it('marks a changed draft as agent_edited', () => {
    expect(resolveAgentPromptAuthor(draft, `${draft} End on the logo.`)).toBe(
      'agent_edited',
    );
  });

  it('records nothing without a draft or for empty text', () => {
    expect(resolveAgentPromptAuthor(null, draft)).toBeUndefined();
    expect(resolveAgentPromptAuthor(draft, '  ')).toBeUndefined();
  });
});
