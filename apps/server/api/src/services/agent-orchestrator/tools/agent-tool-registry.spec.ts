import { BRAND_PROFILE_GENERATION_CREDIT_COST } from '@api/collections/brands/constants/brand-profile.constant';
import { AGENT_CREDIT_COSTS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import {
  getToolDefinitionByName,
  getToolDefinitions,
} from '@api/services/agent-orchestrator/tools/agent-tool-registry';
import { getToolByName, getToolsForSurface } from '@genfeedai/actions';
import { AgentToolName } from '@genfeedai/contracts/interfaces';

describe('agent-tool-registry', () => {
  it('should include onboarding tool definitions', () => {
    const definitions = getToolDefinitions();
    const names = definitions.map((tool) => tool.name);

    expect(names).toContain(AgentToolName.CREATE_BRAND);
    expect(names).toContain(AgentToolName.RENAME_BRAND);
    expect(names).toContain(AgentToolName.CHECK_ONBOARDING_STATUS);
    expect(names).toContain(AgentToolName.COMPLETE_ONBOARDING);
    expect(names).toContain(AgentToolName.RESOLVE_HANDLE);
    expect(names).toContain(AgentToolName.GET_CURRENT_BRAND);
    expect(names).toContain(AgentToolName.GENERATE_IMAGE);
    expect(names).toContain(AgentToolName.CREATE_LIVESTREAM_BOT);
    expect(names).toContain(AgentToolName.MANAGE_LIVESTREAM_BOT);
    expect(names).toContain(AgentToolName.LIST_ADS_RESEARCH);
    expect(names).toContain(AgentToolName.GET_AD_RESEARCH_DETAIL);
    expect(names).toContain(AgentToolName.CREATE_AD_REMIX_WORKFLOW);
    expect(names).toContain(AgentToolName.LIST_INSTAGRAM_INSPIRATION);
    expect(names).toContain(AgentToolName.GET_INSTAGRAM_INSPIRATION_DETAIL);
    expect(names).toContain(AgentToolName.CREATE_INSTAGRAM_REMIX_WORKFLOW);
    expect(names).toContain(AgentToolName.GENERATE_AD_PACK);
    expect(names).toContain(AgentToolName.PREPARE_AD_LAUNCH_REVIEW);
    expect(names).toContain(AgentToolName.RATE_CONTENT);
    expect(names).toContain(AgentToolName.RATE_INGREDIENT);
    expect(names).toContain(AgentToolName.GET_TOP_INGREDIENTS);
    expect(names).toContain(AgentToolName.REPLICATE_TOP_INGREDIENT);
    expect(names).toContain(AgentToolName.CAPTURE_MEMORY);
    expect(names).toContain(AgentToolName.LIST_GENFEED_TOOLS);
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
    expect(getToolDefinitionByName(AgentToolName.CREATE_POST)).toMatchObject({
      creditCost: 0,
      parameters: {
        properties: {
          confirmed: { type: 'boolean' },
          platforms: { items: { type: 'string' }, type: 'array' },
        },
        type: 'object',
      },
    });
    expect(
      getToolDefinitionByName(AgentToolName.LIST_ADS_RESEARCH),
    ).toMatchObject({
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
      getToolDefinitionByName(AgentToolName.PREPARE_AD_LAUNCH_REVIEW)
        ?.description,
    ).toContain('X');
  });

  it('should ship the previously uncataloged cloud tools from the catalog', () => {
    const names = getToolDefinitions().map((tool) => String(tool.name));

    for (const name of [
      AgentToolName.DRAFT_BRAND_VOICE_PROFILE,
      AgentToolName.GENERATE_AD_PACK,
      AgentToolName.GET_WORKFLOW_INPUTS,
      AgentToolName.PREPARE_AD_LAUNCH_REVIEW,
      AgentToolName.SAVE_BRAND_VOICE_PROFILE,
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

    expect(AGENT_CREDIT_COSTS[AgentToolName.GET_WORKFLOW_INPUTS]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.SAVE_BRAND_VOICE_PROFILE]).toBe(0);
  });

  it('should keep the catalog brand profile draft cost pinned to the API constant', () => {
    expect(
      getToolByName(AgentToolName.DRAFT_BRAND_VOICE_PROFILE)?.creditCost,
    ).toBe(BRAND_PROFILE_GENERATION_CREDIT_COST);
  });

  it('should keep the in-app create_post draft free while the catalog prices the MCP publish', () => {
    expect(AGENT_CREDIT_COSTS[AgentToolName.CREATE_POST]).toBe(0);
    expect(getToolByName(AgentToolName.CREATE_POST)?.creditCost).toBe(1);
  });

  it('should set non-zero credit costs for generation tools', () => {
    expect(AGENT_CREDIT_COSTS[AgentToolName.DRAFT_BRAND_VOICE_PROFILE]).toBe(1);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GENERATE_IMAGE]).toBe(50);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GENERATE_VIDEO]).toBe(300);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GENERATE_MUSIC]).toBe(10);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GENERATE_VOICE]).toBe(17);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GENERATE_AS_IDENTITY]).toBe(100);
  });

  it('should set onboarding tool costs to zero', () => {
    expect(AGENT_CREDIT_COSTS[AgentToolName.CREATE_BRAND]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.RENAME_BRAND]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.CHECK_ONBOARDING_STATUS]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.COMPLETE_ONBOARDING]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GET_CURRENT_BRAND]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.CREATE_LIVESTREAM_BOT]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.MANAGE_LIVESTREAM_BOT]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.LIST_ADS_RESEARCH]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GET_AD_RESEARCH_DETAIL]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.CREATE_AD_REMIX_WORKFLOW]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.LIST_INSTAGRAM_INSPIRATION]).toBe(
      0,
    );
    expect(
      AGENT_CREDIT_COSTS[AgentToolName.GET_INSTAGRAM_INSPIRATION_DETAIL],
    ).toBe(0);
    expect(
      AGENT_CREDIT_COSTS[AgentToolName.CREATE_INSTAGRAM_REMIX_WORKFLOW],
    ).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GENERATE_AD_PACK]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.PREPARE_AD_LAUNCH_REVIEW]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.RATE_CONTENT]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.RATE_INGREDIENT]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GET_TOP_INGREDIENTS]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.REPLICATE_TOP_INGREDIENT]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.CAPTURE_MEMORY]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.LIST_GENFEED_TOOLS]).toBe(0);
  });
});
