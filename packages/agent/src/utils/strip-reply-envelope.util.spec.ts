import { describe, expect, it } from 'vitest';
import { stripTrailingReplyEnvelope } from './strip-reply-envelope.util';

describe('stripTrailingReplyEnvelope', () => {
  it('keeps the sentence and the envelope content, and drops the braces', () => {
    const reply =
      'I\'ll check your review queue for pending drafts first.\n{"title":"Check review queue","summary":"Checking pending drafts.","explanation":"The request is to schedule posts.","content":"I\'ll pull up your review queue.","steps":[{"step":"Fetch review queue","status":"in_progress"}]}';

    expect(stripTrailingReplyEnvelope(reply)).toBe(
      "I'll check your review queue for pending drafts first.\n\nI'll pull up your review queue.",
    );
  });

  it('unwraps a reply that is only an envelope', () => {
    expect(
      stripTrailingReplyEnvelope(
        '{"title":"Launch plan","content":"Here is the plan."}',
      ),
    ).toBe('Here is the plan.');
  });

  it.each([
    'Plain answer with no JSON.',
    'Here is the config:\n{"retries":3,"mode":"fast"}',
    'Set it like {braces} in the text }',
  ])('leaves %j as it came', (reply) => {
    expect(stripTrailingReplyEnvelope(reply)).toBe(reply);
  });
});
