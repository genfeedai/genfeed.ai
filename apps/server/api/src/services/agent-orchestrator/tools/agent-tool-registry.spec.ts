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
    expect(names).toContain('create_livestream_bot');
    expect(names).toContain('manage_livestream_bot');
    expect(names).toContain('list_ads_research');
    expect(names).toContain('get_ad_research_detail');
    expect(names).toContain('create_ad_remix_workflow');
    expect(names).toContain('generate_ad_pack');
    expect(names).toContain('prepare_ad_launch_review');
    expect(names).toContain('rate_content');
    expect(names).toContain('rate_ingredient');
    expect(names).toContain('get_top_ingredients');
    expect(names).toContain('replicate_top_ingredient');
    expect(names).toContain('capture_memory');
  });

  it('should not contain duplicate tool names after merging extensions', () => {
    const definitions = getToolDefinitions();
    const names = definitions.map((tool) => String(tool.name));
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });

  it('should set onboarding tool costs to zero', () => {
    expect(AGENT_CREDIT_COSTS[AgentToolName.CREATE_BRAND]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.CHECK_ONBOARDING_STATUS]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.COMPLETE_ONBOARDING]).toBe(0);
    expect(AGENT_CREDIT_COSTS[AgentToolName.GET_CURRENT_BRAND]).toBe(0);
    expect(AGENT_CREDIT_COSTS.create_livestream_bot).toBe(0);
    expect(AGENT_CREDIT_COSTS.manage_livestream_bot).toBe(0);
    expect(AGENT_CREDIT_COSTS.list_ads_research).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_ad_research_detail).toBe(0);
    expect(AGENT_CREDIT_COSTS.create_ad_remix_workflow).toBe(0);
    expect(AGENT_CREDIT_COSTS.generate_ad_pack).toBe(0);
    expect(AGENT_CREDIT_COSTS.prepare_ad_launch_review).toBe(0);
    expect(AGENT_CREDIT_COSTS.rate_content).toBe(0);
    expect(AGENT_CREDIT_COSTS.rate_ingredient).toBe(0);
    expect(AGENT_CREDIT_COSTS.get_top_ingredients).toBe(0);
    expect(AGENT_CREDIT_COSTS.replicate_top_ingredient).toBe(0);
    expect(AGENT_CREDIT_COSTS.capture_memory).toBe(0);
  });
});
