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
