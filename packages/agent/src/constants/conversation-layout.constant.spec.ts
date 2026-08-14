import { describe, expect, it } from 'vitest';

import {
  AGENT_ASSISTANT_PROSE_CLASS,
  AGENT_CONVERSATION_INLINE_ROW_CLASS,
  AGENT_CONVERSATION_SURFACE_CLASS,
  AGENT_CONVERSATION_TRACK_CLASS,
  AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS,
} from './conversation-layout.constant';

describe('conversation-layout.constant', () => {
  it('owns a T3-dense track with min-w-0 and max-w-3xl', () => {
    expect(AGENT_CONVERSATION_TRACK_CLASS).toContain('min-w-0');
    expect(AGENT_CONVERSATION_TRACK_CLASS).toContain('max-w-3xl');
    expect(AGENT_CONVERSATION_TRACK_CLASS).toContain('px-3');
    expect(AGENT_CONVERSATION_TRACK_CLASS).not.toContain('max-w-4xl');
  });

  it('shares solid surface chrome without blur stack', () => {
    expect(AGENT_CONVERSATION_SURFACE_CLASS).toContain('bg-tertiary');
    expect(AGENT_CONVERSATION_SURFACE_CLASS).not.toContain('bg-card');
    expect(AGENT_CONVERSATION_SURFACE_CLASS).not.toContain('backdrop-blur');
  });

  it('provides a borderless inline row for low-chrome status', () => {
    expect(AGENT_CONVERSATION_INLINE_ROW_CLASS).toContain('min-w-0');
    expect(AGENT_CONVERSATION_INLINE_ROW_CLASS).not.toContain('border');
  });

  it('highlights the sticky user prompt as a tertiary card, not a You label', () => {
    expect(AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS).toContain('bg-tertiary');
    expect(AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS).toContain(
      'border-border-strong',
    );
    expect(AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS).toContain(
      'text-foreground',
    );
    expect(AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS).toContain('rounded-xl');
    expect(AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS).not.toContain(
      'bg-transparent',
    );
  });

  it('keeps assistant prose at full foreground contrast', () => {
    expect(AGENT_ASSISTANT_PROSE_CLASS).toContain('text-foreground');
    expect(AGENT_ASSISTANT_PROSE_CLASS).not.toContain('text-foreground/');
  });
});
