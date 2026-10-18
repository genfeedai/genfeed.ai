import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { AgentAutonomyMode, AgentPublishDecision } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// #7338: a strategy without its own autonomy mode follows the organization's
// `agentPolicy.autonomyDefault`, the same fallback agent execution uses.
describe('AutonomousPublishPolicyService organization autonomy default', () => {
  const db = {
    agentStrategy: { findFirst: vi.fn() },
    brand: { findFirst: vi.fn() },
    credential: { findFirst: vi.fn(), findMany: vi.fn() },
    organizationSetting: { findFirst: vi.fn() },
    persona: { findFirst: vi.fn() },
  };
  const target = {
    brandId: 'brand-1',
    credentialId: 'credential-1',
    organizationId: 'org-1',
    platform: 'linkedin',
    strategyId: 'strategy-1',
  };
  let service: AutonomousPublishPolicyService;

  function strategyWithConfig(config: Record<string, unknown>) {
    db.agentStrategy.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      config,
      id: 'strategy-1',
      isActive: true,
      policies: { publishPolicy: { autoPublishEnabled: true } },
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    db.brand.findFirst.mockResolvedValue({
      agentConfig: { autoPublish: { enabled: true } },
    });
    db.credential.findFirst.mockResolvedValue({
      id: 'credential-1',
      platform: 'LINKEDIN',
    });
    db.organizationSetting.findFirst.mockResolvedValue({
      agentPolicy: { autonomyDefault: AgentAutonomyMode.AUTO_PUBLISH },
    });
    service = new AutonomousPublishPolicyService(db as never, {} as never);
  });

  it('uses the organization default when the strategy has no mode', async () => {
    strategyWithConfig({});

    const policy = await service.resolveForTarget(target);

    expect(policy.autonomyMode).toBe(AgentAutonomyMode.AUTO_PUBLISH);
    expect(policy.result.decision).toBe(AgentPublishDecision.PERMITTED);
    expect(db.organizationSetting.findFirst).toHaveBeenCalledWith({
      select: { agentPolicy: true },
      where: { organizationId: 'org-1' },
    });
  });

  it("keeps the strategy's own mode over the organization default", async () => {
    strategyWithConfig({ autonomyMode: AgentAutonomyMode.SUPERVISED });

    const policy = await service.resolveForTarget(target);

    expect(policy.autonomyMode).toBe(AgentAutonomyMode.SUPERVISED);
    expect(policy.result.decision).toBe(AgentPublishDecision.DENIED);
    expect(db.organizationSetting.findFirst).not.toHaveBeenCalled();
  });

  it('stays supervised when neither the strategy nor the organization sets a mode', async () => {
    strategyWithConfig({});
    db.organizationSetting.findFirst.mockResolvedValue(null);

    const policy = await service.resolveForTarget(target);

    expect(policy.autonomyMode).toBe(AgentAutonomyMode.SUPERVISED);
    expect(policy.result.decision).toBe(AgentPublishDecision.DENIED);
  });

  it('still needs the agent and brand opt-ins under an auto-publish default', async () => {
    strategyWithConfig({});
    db.brand.findFirst.mockResolvedValue({
      agentConfig: { autoPublish: { enabled: false } },
    });

    const policy = await service.resolveForTarget(target);

    expect(policy.autonomyMode).toBe(AgentAutonomyMode.AUTO_PUBLISH);
    expect(policy.result.decision).toBe(AgentPublishDecision.DENIED);
  });

  it('does not read organization settings for a persona post', async () => {
    db.persona.findFirst.mockResolvedValue({ config: {} });

    await service.resolveForTarget({
      ...target,
      personaId: 'persona-1',
      strategyId: undefined,
    });

    expect(db.organizationSetting.findFirst).not.toHaveBeenCalled();
  });
});
