import { AgentAutonomyMode, RouterPriority } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { describe, expect, it } from 'vitest';

import {
  resolveEffectiveAgentExecutionConfig,
  resolveEffectiveAgentRuntimeConfig,
  resolveEffectiveBrandAgentConfig,
} from './brand-agent-config-resolution.util';

describe('resolveEffectiveBrandAgentConfig', () => {
  it('falls back to organization default model when the brand has no default model', () => {
    const result = resolveEffectiveBrandAgentConfig({
      brand: {
        agentConfig: {
          persona: 'Stay clear and direct',
          voice: { tone: 'confident' },
        },
      } as never,
      organizationSettings: {
        defaultModel: 'anthropic/claude-sonnet-5',
      } as never,
    });

    expect(result.defaultModel).toBe('anthropic/claude-sonnet-5');
    expect(result.persona).toBe('Stay clear and direct');
    expect(result.voice?.tone).toBe('confident');
    expect(result.platformOverrideApplied).toBe(false);
  });

  it('applies platform overrides on top of brand defaults', () => {
    const result = resolveEffectiveBrandAgentConfig({
      brand: {
        agentConfig: {
          defaultModel: 'anthropic/claude-3.5-sonnet',
          persona: 'Sound technical',
          platformOverrides: {
            linkedin: {
              defaultModel: 'openai/gpt-5.6-terra',
              persona: 'Sound more executive',
              strategy: { platforms: ['linkedin'] },
              voice: { style: 'executive', tone: 'insightful' },
            },
          },
          strategy: { goals: ['pipeline'] },
          voice: { hashtags: ['#genfeed'], tone: 'professional' },
        },
      } as never,
      organizationSettings: {
        defaultModel: 'anthropic/claude-sonnet-5',
      } as never,
      platform: 'linkedin',
    });

    expect(result.defaultModel).toBe('openai/gpt-5.6-terra');
    expect(result.persona).toBe('Sound more executive');
    expect(result.voice).toEqual({
      hashtags: ['#genfeed'],
      style: 'executive',
      tone: 'insightful',
    });
    expect(result.strategy).toEqual({
      goals: ['pipeline'],
      platforms: ['linkedin'],
    });
    expect(result.platformOverrideApplied).toBe(true);
  });

  it('preserves brand and organization identity defaults as separate sources', () => {
    const brandVoiceId = testId('id', 1);
    const organizationVoiceId = testId('id', 1);

    const result = resolveEffectiveBrandAgentConfig({
      brand: {
        agentConfig: {
          defaultAvatarPhotoUrl: 'https://cdn.example.com/brand-avatar.png',
          defaultVoiceId: brandVoiceId,
        },
      } as never,
      organizationSettings: {
        defaultAvatarIngredientId: testId('id', 1),
        defaultVoiceId: organizationVoiceId,
      } as never,
    });

    expect(result.identityDefaults.brand.defaultAvatarPhotoUrl).toBe(
      'https://cdn.example.com/brand-avatar.png',
    );
    expect(result.identityDefaults.brand.defaultVoiceId).toBe(brandVoiceId);
    expect(result.identityDefaults.organization.defaultVoiceId).toBe(
      organizationVoiceId,
    );
    expect(
      result.identityDefaults.organization.defaultAvatarIngredientId,
    ).toBeDefined();
  });

  it('resolves effective identity defaults from brand first, then organization', () => {
    const result = resolveEffectiveBrandAgentConfig({
      brand: {
        agentConfig: {
          defaultAvatarPhotoUrl: 'https://cdn.example.com/brand-avatar.png',
          defaultVoiceId: testId('id', 2),
        },
      } as never,
      organizationSettings: {
        defaultAvatarIngredientId: testId('id', 1),
        defaultAvatarPhotoUrl: 'https://cdn.example.com/org-avatar.png',
        defaultVoiceId: testId('id', 3),
      } as never,
    });

    expect(result.identityDefaults.effective).toMatchObject({
      defaultAvatarIngredientId: testId('id', 1),
      defaultAvatarPhotoUrl: 'https://cdn.example.com/brand-avatar.png',
      defaultVoiceId: testId('id', 2),
    });
  });
});

describe('resolveEffectiveAgentExecutionConfig', () => {
  it('inherits execution defaults from organization settings', () => {
    const result = resolveEffectiveAgentExecutionConfig({
      organizationSettings: {
        agentPolicy: {
          allowAdvancedOverrides: true,
          autonomyDefault: 'supervised',
          creditGovernance: {
            agentDailyCreditCap: 120,
            brandDailyCreditCap: 480,
            useOrganizationPool: true,
          },
          generationModelOverride: 'openai/gpt-5.6-terra',
          qualityTierDefault: 'high_quality',
          reviewModelOverride: 'openai/gpt-5.6-luna',
          thinkingModelOverride: 'anthropic/claude-opus-5',
        },
      } as never,
    });

    expect(result.policy).toMatchObject({
      allowAdvancedOverrides: true,
      // Unmigrated lowercase blobs normalize to the SCREAMING domain labels.
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      generationModelOverride: 'openai/gpt-5.6-terra',
      generationPriority: RouterPriority.QUALITY,
      qualityTier: 'high_quality',
      reviewModelOverride: 'openai/gpt-5.6-luna',
      thinkingModelOverride: 'anthropic/claude-opus-5',
    });
  });

  it('lets strategy-level overrides win over inherited org policy', () => {
    const strategyBrandId = testId('id', 1);

    const result = resolveEffectiveAgentExecutionConfig({
      organizationSettings: {
        agentPolicy: {
          autonomyDefault: 'supervised',
          qualityTierDefault: 'high_quality',
        },
      } as never,
      strategy: {
        autonomyMode: 'auto_publish',
        brandId: strategyBrandId,
        model: 'deepseek/deepseek-v4-flash-0731',
        platforms: ['twitter'],
        qualityTier: 'budget',
      } as never,
    });

    expect(result.policy).toMatchObject({
      autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
      brandId: strategyBrandId.toString(),
      generationPriority: RouterPriority.COST,
      platform: 'twitter',
      qualityTier: 'budget',
    });
    expect(result.strategyModel).toBe('deepseek/deepseek-v4-flash-0731');
  });
});

describe('resolveEffectiveAgentRuntimeConfig', () => {
  it('returns one merged runtime config surface for brand and execution concerns', () => {
    const strategyBrandId = testId('id', 1);

    const result = resolveEffectiveAgentRuntimeConfig({
      brand: {
        agentConfig: {
          defaultModel: 'anthropic/claude-3.5-sonnet',
          platformOverrides: {
            linkedin: {
              defaultModel: 'openai/gpt-5.6-terra',
            },
          },
        },
      } as never,
      organizationSettings: {
        agentPolicy: {
          qualityTierDefault: 'high_quality',
        },
      } as never,
      platform: 'linkedin',
      strategy: {
        brandId: strategyBrandId,
        platforms: ['linkedin'],
        qualityTier: 'budget',
      } as never,
    });

    expect(result.brand.defaultModel).toBe('openai/gpt-5.6-terra');
    expect(result.execution.policy).toMatchObject({
      brandId: strategyBrandId.toString(),
      generationPriority: RouterPriority.COST,
      platform: 'linkedin',
      qualityTier: 'budget',
    });
  });
});
