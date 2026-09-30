import { describe, expect, it } from 'vitest';
import { AgentAutonomyMode, AgentPublishDecision } from '../../src';
import { evaluateAgentPublishPolicy } from '../../src/api-types/contracts/agent-publish-policy.contract';

describe('evaluateAgentPublishPolicy', () => {
  it('denies SUPERVISED even when brand and channel opt in', () => {
    const result = evaluateAgentPublishPolicy({
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      brandAllowsAutoPublish: true,
      channelAllowsAutoPublish: true,
    });
    expect(result.decision).toBe(AgentPublishDecision.DENIED);
    expect(result.policyName).toBe('autonomy-brand-channel');
  });

  it('denies AUTO_PUBLISH when the brand has not opted in', () => {
    const result = evaluateAgentPublishPolicy({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      brandAllowsAutoPublish: false,
      channelAllowsAutoPublish: true,
    });
    expect(result.decision).toBe(AgentPublishDecision.DENIED);
  });

  it('denies AUTO_PUBLISH when the channel has not opted in', () => {
    const result = evaluateAgentPublishPolicy({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      brandAllowsAutoPublish: true,
      channelAllowsAutoPublish: false,
    });
    expect(result.decision).toBe(AgentPublishDecision.DENIED);
  });

  it('permits AUTO_PUBLISH when brand and channel both opt in', () => {
    const result = evaluateAgentPublishPolicy({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      brandAllowsAutoPublish: true,
      channelAllowsAutoPublish: true,
    });
    expect(result.decision).toBe(AgentPublishDecision.PERMITTED);
  });
});

describe('evaluateAgentPublishPolicy with a media assessment (#4881)', () => {
  const autonomyModes = Object.values(AgentAutonomyMode);
  const booleans = [true, false];
  const assessments = [
    undefined,
    { isBlocking: false, reasons: [] },
    { isBlocking: true, reasons: ['Moderation flagged violence.'] },
    { isBlocking: true, reasons: [] },
  ];

  const combos = autonomyModes.flatMap((autonomyMode) =>
    booleans.flatMap((brandAllowsAutoPublish) =>
      booleans.flatMap((channelAllowsAutoPublish) =>
        assessments.map((mediaAssessment) => ({
          autonomyMode,
          brandAllowsAutoPublish,
          channelAllowsAutoPublish,
          mediaAssessment,
        })),
      ),
    ),
  );

  it.each(combos)('only ever tightens: %o', (input) => {
    const baseline = evaluateAgentPublishPolicy({
      autonomyMode: input.autonomyMode,
      brandAllowsAutoPublish: input.brandAllowsAutoPublish,
      channelAllowsAutoPublish: input.channelAllowsAutoPublish,
    });
    const result = evaluateAgentPublishPolicy(input);

    if (baseline.decision === AgentPublishDecision.DENIED) {
      expect(result.decision).toBe(AgentPublishDecision.DENIED);
    }
    if (input.mediaAssessment?.isBlocking) {
      expect(result.decision).toBe(AgentPublishDecision.DENIED);
      expect(result.mediaAssessmentReasons?.length).toBeGreaterThan(0);
    } else {
      expect(result).toEqual(baseline);
    }
  });

  it('keeps a denial reason and attaches the media reasons for the card', () => {
    const result = evaluateAgentPublishPolicy({
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      brandAllowsAutoPublish: true,
      channelAllowsAutoPublish: true,
      mediaAssessment: { isBlocking: true, reasons: ['Flagged.'] },
    });
    expect(result.reason).toBe('Autonomy mode requires human approval.');
    expect(result.mediaAssessmentReasons).toEqual(['Flagged.']);
  });

  it('turns a permitted auto-publish into review with the reasons', () => {
    const result = evaluateAgentPublishPolicy({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      brandAllowsAutoPublish: true,
      channelAllowsAutoPublish: true,
      mediaAssessment: {
        isBlocking: true,
        reasons: ['Moderation flagged violence.', 'Vision flagged artifacts.'],
      },
    });
    expect(result.decision).toBe(AgentPublishDecision.DENIED);
    expect(result.reason).toBe(
      'Media review required: Moderation flagged violence.; Vision flagged artifacts.',
    );
  });
});
