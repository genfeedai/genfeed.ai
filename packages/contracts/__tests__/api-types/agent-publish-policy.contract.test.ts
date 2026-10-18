import { describe, expect, it } from 'vitest';
import { AgentAutonomyMode, AgentPublishDecision } from '../../src';
import { evaluateAgentPublishPolicy } from '../../src/api-types/contracts/agent-publish-policy.contract';
import {
  type BrandPolicyEvaluationInput,
  createDefaultBrandPublishPolicy,
} from '../../src/api-types/contracts/brand-publish-policy.contract';

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

describe('evaluateAgentPublishPolicy with the brand Policy (#7339)', () => {
  const permitted = {
    autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
    brandAllowsAutoPublish: true,
    channelAllowsAutoPublish: true,
  };
  function brandPolicy(
    overrides: Partial<BrandPolicyEvaluationInput> = {},
    draft: Partial<BrandPolicyEvaluationInput['draft']> = {},
  ): BrandPolicyEvaluationInput {
    return {
      draft: {
        format: 'text',
        platform: 'x',
        publishAt: '2026-10-19T12:00:00.000Z',
        qualityScore: null,
        text: 'Shipping the new release today.',
        ...draft,
      },
      judgeViolations: [],
      passedChecks: [],
      policy: createDefaultBrandPublishPolicy(),
      usage: { postsInDay: 0, postsInWeek: 0 },
      ...overrides,
    };
  }

  it('permits a clean draft under an approved Policy', () => {
    const result = evaluateAgentPublishPolicy({
      ...permitted,
      brandPolicy: brandPolicy(),
    });
    expect(result.decision).toBe(AgentPublishDecision.PERMITTED);
    expect(result.policyViolations).toBeUndefined();
  });

  it('routes video to review regardless of autonomy and streak', () => {
    for (const autonomyMode of Object.values(AgentAutonomyMode)) {
      const result = evaluateAgentPublishPolicy({
        ...permitted,
        autonomyMode,
        brandPolicy: brandPolicy({}, { format: 'video' }),
      });
      expect(result.decision).toBe(AgentPublishDecision.DENIED);
      expect(result.policyViolations?.map((v) => v.rule)).toContain(
        'video_always_reviewed',
      );
    }
  });

  it('appends the judge findings and names them in the reason', () => {
    const result = evaluateAgentPublishPolicy({
      ...permitted,
      brandPolicy: brandPolicy({
        judgeViolations: [
          { detail: 'Discusses elections.', rule: 'banned_topic' },
        ],
      }),
    });
    expect(result.decision).toBe(AgentPublishDecision.DENIED);
    expect(result.reason).toBe(
      'Brand Policy requires review: Discusses elections.',
    );
  });

  it('keeps the violations on a supervised denial for the reviewer', () => {
    const result = evaluateAgentPublishPolicy({
      ...permitted,
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      brandPolicy: brandPolicy({}, { format: 'video' }),
    });
    expect(result.reason).toBe('Autonomy mode requires human approval.');
    expect(result.policyViolations?.[0]?.rule).toBe('video_always_reviewed');
  });
});
