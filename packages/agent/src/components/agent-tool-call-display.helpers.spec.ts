import { describe, expect, it } from 'vitest';
import { TOOL_LABELS } from './agent-tool-call-display.helpers';

describe('outreach sequence tool labels', () => {
  it('names outreach-sequence tools without generic Campaign copy', () => {
    expect(TOOL_LABELS.create_outreach_sequence).toBe(
      'Create outreach sequence',
    );
    expect(TOOL_LABELS.start_outreach_sequence).toBe('Start outreach sequence');
    expect(TOOL_LABELS.pause_outreach_sequence).toBe('Pause outreach sequence');
    expect(TOOL_LABELS.complete_outreach_sequence).toBe(
      'Complete outreach sequence',
    );
    expect(TOOL_LABELS.get_outreach_sequence_analytics).toBe(
      'Outreach sequence analytics',
    );

    expect(TOOL_LABELS.create_campaign).toBeUndefined();
    expect(TOOL_LABELS.start_campaign).toBeUndefined();
    expect(TOOL_LABELS.pause_campaign).toBeUndefined();
    expect(TOOL_LABELS.complete_campaign).toBeUndefined();
    expect(TOOL_LABELS.get_campaign_analytics).toBeUndefined();
  });
});
