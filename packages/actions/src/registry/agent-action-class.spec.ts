import { describe, expect, it } from 'vitest';
import {
  AGENT_ACTION_CLASS,
  getAgentActionClass,
  resolveEffectiveMutationPolicy,
  VISUAL_GENERATION_REVIEW_TOOL_NAMES,
} from './agent-action-class';
import { getDeclaredMutationPolicy } from './mutation-policy';

describe('getAgentActionClass', () => {
  it('classifies media generation as credit-spending', () => {
    expect(getAgentActionClass('generate_image')).toBe(
      AGENT_ACTION_CLASS.CREDIT_SPENDING,
    );
    expect(getAgentActionClass('generate_video')).toBe(
      AGENT_ACTION_CLASS.CREDIT_SPENDING,
    );
    expect(getAgentActionClass('generate_voice')).toBe(
      AGENT_ACTION_CLASS.CREDIT_SPENDING,
    );
  });

  it('classifies brand voice/memory/knowledge/strategy writes as brand-context', () => {
    expect(getAgentActionClass('save_brand_voice_profile')).toBe(
      AGENT_ACTION_CLASS.BRAND_CONTEXT,
    );
    expect(getAgentActionClass('capture_memory')).toBe(
      AGENT_ACTION_CLASS.BRAND_CONTEXT,
    );
    expect(getAgentActionClass('capture_knowledge')).toBe(
      AGENT_ACTION_CLASS.BRAND_CONTEXT,
    );
    expect(getAgentActionClass('update_strategy_state')).toBe(
      AGENT_ACTION_CLASS.BRAND_CONTEXT,
    );
    expect(getAgentActionClass('create_brand')).toBe(
      AGENT_ACTION_CLASS.BRAND_CONTEXT,
    );
  });

  it('classifies sends/publishes/schedules as outbound', () => {
    expect(getAgentActionClass('send_social_dm')).toBe(
      AGENT_ACTION_CLASS.OUTBOUND,
    );
    expect(getAgentActionClass('schedule_post')).toBe(
      AGENT_ACTION_CLASS.OUTBOUND,
    );
    expect(getAgentActionClass('start_outreach_sequence')).toBe(
      AGENT_ACTION_CLASS.OUTBOUND,
    );
  });

  it('falls back to gated for tools already approval-required and not otherwise classified', () => {
    expect(getDeclaredMutationPolicy('install_official_workflow')).toBe(
      'approval-required',
    );
    expect(getAgentActionClass('install_official_workflow')).toBe(
      AGENT_ACTION_CLASS.GATED,
    );
  });

  it('leaves mundane direct writes unclassified', () => {
    expect(getAgentActionClass('create_chat')).toBeUndefined();
    expect(getAgentActionClass('tag_social_conversation')).toBeUndefined();
  });

  it('names the visual-generation tools the docked review card covers', () => {
    expect(VISUAL_GENERATION_REVIEW_TOOL_NAMES.has('generate_image')).toBe(
      true,
    );
    expect(VISUAL_GENERATION_REVIEW_TOOL_NAMES.has('generate_video')).toBe(
      true,
    );
    // Avatar identity generation is credit-spending but has no `prompt` —
    // it stays on the generic mutation-approval card, not this one.
    expect(
      VISUAL_GENERATION_REVIEW_TOOL_NAMES.has('generate_as_identity'),
    ).toBe(false);
  });
});

describe('resolveEffectiveMutationPolicy — #4672 confirmation matrix', () => {
  it('Manual confirms credit-spending, brand-context, gated, and outbound', () => {
    expect(
      resolveEffectiveMutationPolicy('generate_image', 'manual', 'direct'),
    ).toBe('approval-required');
    expect(
      resolveEffectiveMutationPolicy(
        'save_brand_voice_profile',
        'manual',
        'direct',
      ),
    ).toBe('approval-required');
    expect(
      resolveEffectiveMutationPolicy(
        'create_brand',
        'manual',
        'approval-required',
      ),
    ).toBe('approval-required');
    expect(
      resolveEffectiveMutationPolicy('schedule_post', 'manual', 'direct'),
    ).toBe('approval-required');
  });

  it('Auto executes credit-spending, brand-context, and gated without confirmation', () => {
    expect(
      resolveEffectiveMutationPolicy('generate_image', 'auto', 'direct'),
    ).toBe('direct');
    expect(
      resolveEffectiveMutationPolicy(
        'save_brand_voice_profile',
        'auto',
        'direct',
      ),
    ).toBe('direct');
    expect(
      resolveEffectiveMutationPolicy(
        'create_brand',
        'auto',
        'approval-required',
      ),
    ).toBe('direct');
  });

  it('Auto still confirms outbound', () => {
    expect(
      resolveEffectiveMutationPolicy('schedule_post', 'auto', 'direct'),
    ).toBe('approval-required');
    expect(
      resolveEffectiveMutationPolicy(
        'send_social_dm',
        'auto',
        'approval-required',
      ),
    ).toBe('approval-required');
  });

  it('Plan (running its approved steps) behaves like Auto except outbound', () => {
    expect(
      resolveEffectiveMutationPolicy('generate_image', 'plan', 'direct'),
    ).toBe('direct');
    expect(
      resolveEffectiveMutationPolicy('schedule_post', 'plan', 'direct'),
    ).toBe('approval-required');
  });

  it('leaves an unclassified tool at its declared policy in every mode', () => {
    expect(
      resolveEffectiveMutationPolicy('create_chat', 'manual', 'direct'),
    ).toBe('direct');
    expect(
      resolveEffectiveMutationPolicy('create_chat', 'auto', 'direct'),
    ).toBe('direct');
  });

  it('leaves the declared policy untouched with no mode at all (MCP, CLI, a recurring task — #4672 modes are a per-thread concept)', () => {
    expect(
      resolveEffectiveMutationPolicy('generate_image', undefined, 'direct'),
    ).toBe('direct');
    expect(
      resolveEffectiveMutationPolicy(
        'create_brand',
        undefined,
        'approval-required',
      ),
    ).toBe('approval-required');
  });
});
