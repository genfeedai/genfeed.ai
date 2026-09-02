import { describe, expect, test } from 'vitest';
import { AgentAutonomyMode } from '../../src';
import {
  evaluateAgentAutoPublishPolicies,
  evaluateAgentAutoPublishPolicy,
} from '../../src/api-types/contracts/agent-auto-publish.contract';

describe('evaluateAgentAutoPublishPolicy', () => {
  test('SUPERVISED requires approval on every channel', () => {
    const result = evaluateAgentAutoPublishPolicy({
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      brandAutoPublishEnabled: true,
      channel: 'instagram',
    });

    expect(result).toEqual({
      channel: 'instagram',
      isPermitted: false,
      policyId: 'supervised.require_approval',
      requiresApproval: true,
    });
  });

  test('legacy lowercase autonomy values still require approval', () => {
    const result = evaluateAgentAutoPublishPolicy({
      autonomyMode: 'supervised',
      brandAutoPublishEnabled: true,
      channel: 'tiktok',
    });

    expect(result.policyId).toBe('supervised.require_approval');
    expect(result.isPermitted).toBe(false);
  });

  test('AUTO_PUBLISH is denied when the brand toggle is off', () => {
    const result = evaluateAgentAutoPublishPolicy({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      brandAutoPublishEnabled: false,
      channel: 'linkedin',
    });

    expect(result).toEqual({
      channel: 'linkedin',
      isPermitted: false,
      policyId: 'brand.auto_publish_disabled',
      requiresApproval: true,
    });
  });

  test('AUTO_PUBLISH is denied for a blocked channel', () => {
    const result = evaluateAgentAutoPublishPolicy({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      blockedChannels: ['YouTube'],
      brandAutoPublishEnabled: true,
      channel: 'youtube',
    });

    expect(result.policyId).toBe('channel.auto_publish_blocked');
    expect(result.isPermitted).toBe(false);
  });

  test('AUTO_PUBLISH is permitted when brand and channel allow it', () => {
    const result = evaluateAgentAutoPublishPolicy({
      autonomyMode: 'auto_publish',
      brandAutoPublishEnabled: true,
      channel: 'twitter',
    });

    expect(result).toEqual({
      channel: 'twitter',
      isPermitted: true,
      policyId: 'auto_publish.permitted',
      requiresApproval: false,
    });
  });
});

describe('evaluateAgentAutoPublishPolicies', () => {
  test('permits only when every channel is allowed', () => {
    const permitted = evaluateAgentAutoPublishPolicies({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      brandAutoPublishEnabled: true,
      channels: ['instagram', 'tiktok'],
    });

    expect(permitted.isPermitted).toBe(true);
    expect(permitted.policyId).toBe('auto_publish.permitted');
    expect(permitted.decisions).toHaveLength(2);
  });

  test('denies the whole publish when any channel is blocked', () => {
    const denied = evaluateAgentAutoPublishPolicies({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      blockedChannels: ['tiktok'],
      brandAutoPublishEnabled: true,
      channels: ['instagram', 'tiktok'],
    });

    expect(denied.isPermitted).toBe(false);
    expect(denied.policyId).toBe('channel.auto_publish_blocked');
    expect(denied.requiresApproval).toBe(true);
  });
});
