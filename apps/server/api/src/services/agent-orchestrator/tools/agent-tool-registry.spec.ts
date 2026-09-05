import { BRAND_PROFILE_GENERATION_CREDIT_COST } from '@api/collections/brands/constants/brand-profile.constant';
import { AGENT_CREDIT_COSTS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import {
  getToolDefinitionByName,
  getToolDefinitions,
} from '@api/services/agent-orchestrator/tools/agent-tool-registry';
import { getToolByName, getToolsForSurface } from '@genfeedai/actions';

describe('agent-tool-registry', () => {
  it('should include onboarding tool definitions', () => {
    const definitions = getToolDefinitions();
    const names = definitions.map((tool) => tool.name);

    expect(names).toContain('create_brand');
    expect(names).toContain('rename_brand');
    expect(names).toContain('check_onboarding_status');
    expect(names).toContain('complete_onboarding');
    expect(names).toContain('resolve_handle');
    expect(names).toContain('get_current_brand');
    expect(names).toContain('generate_image');
    expect(names).toContain('create_livestream_bot');
    expect(names).toContain('manage_livestream_bot');
    expect(names).toContain('list_ads_research');
    expect(names).toContain('get_ad_research_detail');
    expect(names).toContain('create_ad_remix_workflow');
    expect(names).toContain('list_instagram_inspiration');
    expect(names).toContain('get_instagram_inspiration_detail');
    expect(names).toContain('create_instagram_remix_workflow');
    expect(names).toContain('generate_ad_pack');
    expect(names).toContain('prepare_ad_launch_review');
    expect(names).toContain('rate_content');
    expect(names).toContain('rate_ingredient');
    expect(names).toContain('get_top_ingredients');
    expect(names).toContain('replicate_top_ingredient');
    expect(names).toContain('capture_memory');
    expect(names).toContain('list_genfeed_tools');
  });

  it('should not contain duplicate tool names after merging extensions', () => {
    const definitions = getToolDefinitions();
    const names = definitions.map((tool) => String(tool.name));
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });

  it('should expose exactly the actions the curated catalog surfaces to the agent', () => {
    const shipped = getToolDefinitions()
      .map((tool) => String(tool.name))
      .sort((a, b) => a.localeCompare(b));
    const curated = getToolsForSurface('agent')
      .map((tool) => tool.name)
      .sort((a, b) => a.localeCompare(b));

    expect(shipped).toEqual(curated);
  });

  it('should preserve representative core and ads extension schemas', () => {
    expect(getToolDefinitionByName('create_post')).toMatchObject({
      creditCost: 0,
      parameters: {
        properties: {
          confirmed: { type: 'boolean' },
          platforms: { items: { type: 'string' }, type: 'array' },
        },
        type: 'object',
      },
    });
    expect(getToolDefinitionByName('list_ads_research')).toMatchObject({
      creditCost: 0,
      parameters: {
        properties: {
          source: {
            enum: ['public', 'my_accounts', 'all'],
            type: 'string',
          },
        },
        type: 'object',
      },
    });
    expect(
      getToolDefinitionByName('prepare_ad_launch_review')?.description,
    ).toContain('X');
  });

  it('should ship the previously uncataloged cloud tools from the catalog', () => {
    const names = getToolDefinitions().map((tool) => String(tool.name));

    for (const name of [
      'draft_brand_voice_profile',
      'generate_ad_pack',
      'get_workflow_inputs',
      'prepare_ad_launch_review',
      'save_brand_voice_profile',
    ]) {
      expect(names, name).toContain(name);
      expect(getToolByName(name)?.surfaces.agent, name).toBe(true);
    }
  });

  it('should price every agent tool, including the folded cloud tools', () => {
    for (const tool of getToolDefinitions()) {
      expect(AGENT_CREDIT_COSTS[String(tool.name)], String(tool.name)).toBe(
        tool.creditCost,
      );
    }

    expect(AGENT_CREDIT_COSTS.get_workflow_inputs).toBe(0);
    expect(AGENT_CREDIT_COSTS.save_brand_voice_profile).toBe(0);
  });

  it('should keep the catalog brand profile draft cost pinned to the API constant', () => {
    expect(getToolByName('draft_brand_voice_profile')?.creditCost).toBe(
      BRAND_PROFILE_GENERATION_CREDIT_COST,
    );
  });

  it('should keep the in-app create_post draft free while the catalog prices the MCP publish', () => {
    expect(AGENT_CREDIT_COSTS.create_post).toBe(0);
    expect(getToolByName('create_post')?.creditCost).toBe(1);
  });

  it('should set non-zero credit costs for generation tools', () => {
    expect(AGENT_CREDIT_COSTS.draft_brand_voice_profile).toBe(1);
    expect(AGENT_CREDIT_COSTS.generate_image).toBe(50);
    expect(AGENT_CREDIT_COSTS.generate_video).toBe(300);
    expect(AGENT_CREDIT_COSTS.generate_music).toBe(10);
    expect(AGENT_CREDIT_COSTS.generate_voice).toBe(17);
    expect(AGENT_CREDIT_COSTS.generate_as_identity).toBe(100);
  });

  it('should set onboarding tool costs to zero', () => {
    expect(AGENT_CREDIT_COSTS.create_brand).toBe(0);
    expect(AGENT_CREDIT_COSTS.rename_brand).toBe(0);
    expect(AGENT_CREDIT_COSTS.check_onboarding_status).toBe(0);
    expect(AGENT_CREDIT_COSTS.complete_onboarding).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_current_brand).toBe(0);
    expect(AGENT_CREDIT_COSTS.create_livestream_bot).toBe(0);
    expect(AGENT_CREDIT_COSTS.manage_livestream_bot).toBe(0);
    expect(AGENT_CREDIT_COSTS.list_ads_research).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_ad_research_detail).toBe(0);
    expect(AGENT_CREDIT_COSTS.create_ad_remix_workflow).toBe(0);
    expect(AGENT_CREDIT_COSTS.list_instagram_inspiration).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_instagram_inspiration_detail).toBe(0);
    expect(AGENT_CREDIT_COSTS.create_instagram_remix_workflow).toBe(0);
    expect(AGENT_CREDIT_COSTS.generate_ad_pack).toBe(0);
    expect(AGENT_CREDIT_COSTS.prepare_ad_launch_review).toBe(0);
    expect(AGENT_CREDIT_COSTS.rate_content).toBe(0);
    expect(AGENT_CREDIT_COSTS.rate_ingredient).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_top_ingredients).toBe(0);
    expect(AGENT_CREDIT_COSTS.replicate_top_ingredient).toBe(0);
    expect(AGENT_CREDIT_COSTS.capture_memory).toBe(0);
    expect(AGENT_CREDIT_COSTS.list_genfeed_tools).toBe(0);
  });
});
