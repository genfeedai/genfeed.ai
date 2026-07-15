import { FeatureFlagController } from '@api/feature-flag/feature-flag.controller';
import { describe, expect, it, vi } from 'vitest';

describe('FeatureFlagController', () => {
  it('evaluates the conversation shell from server-derived organization scope', () => {
    const featureFlagService = {
      evaluateConversationShell: vi.fn().mockReturnValue({ enabled: true }),
    };
    const controller = new FeatureFlagController(featureFlagService as never);

    const response = controller.evaluateConversationShell(
      { context: { organizationId: 'org-123' } } as never,
      'desktop',
    );

    expect(response).toEqual({ enabled: true });
    expect(featureFlagService.evaluateConversationShell).toHaveBeenCalledWith({
      client: 'desktop',
      organizationId: 'org-123',
    });
  });

  it('passes missing client and organization attributes through to fail closed', () => {
    const featureFlagService = {
      evaluateConversationShell: vi.fn().mockReturnValue({ enabled: false }),
    };
    const controller = new FeatureFlagController(featureFlagService as never);

    controller.evaluateConversationShell({} as never, undefined);

    expect(featureFlagService.evaluateConversationShell).toHaveBeenCalledWith({
      client: undefined,
      organizationId: undefined,
    });
  });
});
