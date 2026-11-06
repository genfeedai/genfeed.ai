import { describe, expect, it } from 'vitest';

import {
  AGENT_ASSISTANT_PROSE_CLASS,
  AGENT_CONVERSATION_INLINE_ROW_CLASS,
  AGENT_CONVERSATION_SCROLL_CLASS,
  AGENT_CONVERSATION_SURFACE_CLASS,
  AGENT_CONVERSATION_TRACK_CLASS,
  AGENT_CONVERSATION_USER_BUBBLE_CLASS,
} from './conversation-layout.constant';

describe('conversation-layout.constant', () => {
  it('owns a T3-dense track with min-w-0 and max-w-3xl', () => {
    expect(AGENT_CONVERSATION_TRACK_CLASS).toContain('min-w-0');
    expect(AGENT_CONVERSATION_TRACK_CLASS).toContain('max-w-3xl');
    expect(AGENT_CONVERSATION_TRACK_CLASS).toContain('px-3');
    expect(AGENT_CONVERSATION_TRACK_CLASS).not.toContain('max-w-4xl');
  });

  it('shares solid surface chrome without blur stack', () => {
    expect(AGENT_CONVERSATION_SURFACE_CLASS).toContain('bg-card');
    expect(AGENT_CONVERSATION_SURFACE_CLASS).not.toContain('bg-tertiary');
    expect(AGENT_CONVERSATION_SURFACE_CLASS).not.toContain('backdrop-blur');
  });

  it('provides a borderless inline row for low-chrome status', () => {
    expect(AGENT_CONVERSATION_INLINE_ROW_CLASS).toContain('min-w-0');
    expect(AGENT_CONVERSATION_INLINE_ROW_CLASS).not.toContain('border');
  });

  it('sizes the user message to its text on the right, never pinned', () => {
    expect(AGENT_CONVERSATION_USER_BUBBLE_CLASS).toContain('w-fit');
    expect(AGENT_CONVERSATION_USER_BUBBLE_CLASS).toContain('max-w-[85%]');
    expect(AGENT_CONVERSATION_USER_BUBBLE_CLASS).not.toContain('sticky');
  });

  it('lays the scroll region out as a column so the composer anchors to the bottom', () => {
    expect(AGENT_CONVERSATION_SCROLL_CLASS).toContain('flex-col');
  });

  it('keeps assistant prose at full foreground contrast', () => {
    expect(AGENT_ASSISTANT_PROSE_CLASS).toContain('text-foreground');
    expect(AGENT_ASSISTANT_PROSE_CLASS).not.toContain('text-foreground/');
  });
});
