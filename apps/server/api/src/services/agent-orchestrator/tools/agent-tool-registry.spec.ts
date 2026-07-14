import { AGENT_CREDIT_COSTS } from '@api/services/agent-orchestrator/constants/agent-credit-costs.constant';
import { getToolDefinitions } from '@api/services/agent-orchestrator/tools/agent-tool-registry';
import { AgentToolName } from '@genfeedai/interfaces';

describe('agent-tool-registry', () => {
  it('should include onboarding tool definitions', () => {
    const definitions = getToolDefinitions();
    const names = definitions.map((tool) => tool.name);

    expect(names).toContain(AgentToolName.CREATE_BRAND);
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
    expect(AGENT_CREDIT_COSTS[AgentToolName.CHECK_ONBOARDING_STATUS]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.COMPLETE_ONBOARDING]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GET_CURRENT_BRAND]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.CREATE_LIVESTREAM_BOT]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.MANAGE_LIVESTREAM_BOT]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.LIST_ADS_RESEARCH]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GET_AD_RESEARCH_DETAIL]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.CREATE_AD_REMIX_WORKFLOW]).toBe(0);
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
