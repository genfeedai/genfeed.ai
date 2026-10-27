import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  AGENT_UNPRODUCED_DRAFTS_FALLBACK,
  claimsUnproducedDrafts,
  withdrawUnproducedDraftClaims,
} from '@api/services/agent-orchestrator/utils/agent-unproduced-drafts.util';
import type { AgentUiAction } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const card = (type: string): AgentUiAction =>
  ({ id: type, title: type, type }) as AgentUiAction;
const tool = (toolName: string): ToolCallSummary => ({
  creditsUsed: 0,
  durationMs: 1,
  status: 'completed',
  toolName,
});

describe('claimsUnproducedDrafts', () => {
  it.each([
    'Three drafts are ready above.',
    'Your X post drafts are ready below.',
    "Here are the three drafts. They're attached.",
  ])('flags "%s" when the turn produced nothing', (content) => {
    expect(
      claimsUnproducedDrafts(
        content,
        [tool('suggest_next_steps')],
        [card('next_steps_card')],
      ),
    ).toBe(true);
  });

  it('accepts the claim when a draft card exists', () => {
    expect(
      claimsUnproducedDrafts(
        'Three drafts are ready above.',
        [],
        [card('content_preview_card')],
      ),
    ).toBe(false);
  });

  it('accepts the claim when a draft-producing tool completed', () => {
    expect(
      claimsUnproducedDrafts(
        'Three drafts are ready above.',
        [tool('generate_content')],
        [],
      ),
    ).toBe(false);
  });

  it('accepts the claim when the reply carries the draft text', () => {
    const content = [
      'The drafts are ready:',
      '1. Season it twice, wipe it never soak it, and it will outlast you.',
      '2. Your skillet is not dirty, it is seasoned. Stop scrubbing it clean.',
    ].join('\n');
    expect(claimsUnproducedDrafts(content, [], [])).toBe(false);
  });

  it.each([
    'I will have the drafts ready once you pick a tone.',
    'Want me to write the drafts now?',
    'The drafts are not ready yet.',
    'I can write three drafts for you.',
  ])('does not flag "%s"', (content) => {
    expect(claimsUnproducedDrafts(content, [], [])).toBe(false);
  });

  it('does not flag a reply that never mentions drafts', () => {
    expect(claimsUnproducedDrafts('Done. The image is below.', [], [])).toBe(
      false,
    );
  });
});

describe('withdrawUnproducedDraftClaims', () => {
  it('replaces a reply that was only the claim', () => {
    expect(withdrawUnproducedDraftClaims('Three drafts are ready above.')).toBe(
      AGENT_UNPRODUCED_DRAFTS_FALLBACK,
    );
  });

  it('keeps the rest of the reply', () => {
    expect(
      withdrawUnproducedDraftClaims(
        'Your brand voice is dry and direct.\nThree drafts are ready above.',
      ),
    ).toBe('Your brand voice is dry and direct.');
  });
});
