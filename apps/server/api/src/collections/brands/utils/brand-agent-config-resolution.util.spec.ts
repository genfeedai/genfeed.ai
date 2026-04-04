import { Types } from 'mongoose';
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
        defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
      } as never,
    });

    expect(result.defaultModel).toBe('anthropic/claude-sonnet-4-5-20250929');
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
              defaultModel: 'openai/gpt-4o',
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
        defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
      } as never,
      platform: 'linkedin',
    });

    expect(result.defaultModel).toBe('openai/gpt-4o');
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
    const brandVoiceId = new Types.ObjectId();
    const organizationVoiceId = new Types.ObjectId();

    const result = resolveEffectiveBrandAgentConfig({
      brand: {
        agentConfig: {
          defaultAvatarPhotoUrl: 'https://cdn.example.com/brand-avatar.png',
          defaultVoiceId: brandVoiceId,
        },
      } as never,
      organizationSettings: {
        defaultAvatarIngredientId: new Types.ObjectId(),
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
          generationModelOverride: 'openai/gpt-4o',
          qualityTierDefault: 'high_quality',
          reviewModelOverride: 'openai/o4-mini',
          thinkingModelOverride: 'anthropic/claude-opus-4-6',
        },
      } as never,
    });

    expect(result.policy).toMatchObject({
      allowAdvancedOverrides: true,
      autonomyMode: 'supervised',
      generationModelOverride: 'openai/gpt-4o',
      generationPriority: 'quality',
      qualityTier: 'high_quality',
      reviewModelOverride: 'openai/o4-mini',
      thinkingModelOverride: 'anthropic/claude-opus-4-6',
    });
  });

  it('lets strategy-level overrides win over inherited org policy', () => {
    const strategyBrandId = new Types.ObjectId();

    const result = resolveEffectiveAgentExecutionConfig({
      organizationSettings: {
        agentPolicy: {
          autonomyDefault: 'supervised',
          qualityTierDefault: 'high_quality',
        },
      } as never,
      strategy: {
        autonomyMode: 'auto_publish',
        brand: strategyBrandId,
        model: 'deepseek/deepseek-chat',
        platforms: ['twitter'],
        qualityTier: 'budget',
      } as never,
    });

    expect(result.policy).toMatchObject({
      autonomyMode: 'auto_publish',
      brandId: strategyBrandId.toString(),
      generationPriority: 'cost',
      platform: 'twitter',
      qualityTier: 'budget',
    });
    expect(result.strategyModel).toBe('deepseek/deepseek-chat');
  });
});

describe('resolveEffectiveAgentRuntimeConfig', () => {
  it('returns one merged runtime config surface for brand and execution concerns', () => {
    const strategyBrandId = new Types.ObjectId();

    const result = resolveEffectiveAgentRuntimeConfig({
      brand: {
        agentConfig: {
          defaultModel: 'anthropic/claude-3.5-sonnet',
          platformOverrides: {
            linkedin: {
              defaultModel: 'openai/gpt-4o',
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
        brand: strategyBrandId,
        platforms: ['linkedin'],
        qualityTier: 'budget',
      } as never,
    });

    expect(result.brand.defaultModel).toBe('openai/gpt-4o');
    expect(result.execution.policy).toMatchObject({
      brandId: strategyBrandId.toString(),
      generationPriority: 'cost',
      platform: 'linkedin',
      qualityTier: 'budget',
    });
  });
});
