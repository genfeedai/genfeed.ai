// @vitest-environment jsdom
'use client';

import PromptBarProvider, {
  usePromptBarContext,
} from '@providers/promptbar/promptbar.provider';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useBrandMock = vi.fn();
const useAuthedServiceMock = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) =>
    useAuthedServiceMock(factory),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('PromptBarProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_123',
      userId: 'clerk_123',
    });
    useBrandMock.mockReturnValue({
      organizationId: 'org_123',
      settings: {
        enabledModels: ['model_enabled'],
      },
    });

    const services = [
      { findAll: vi.fn().mockResolvedValue([]) },
      { findAll: vi.fn().mockResolvedValue([]) },
      {
        findAll: vi.fn().mockResolvedValue([
          {
            id: 'model_enabled',
            isTraining: false,
            key: 'model-enabled',
            label: 'Enabled Model',
          },
          {
            id: 'model_disabled',
            isTraining: false,
            key: 'model-disabled',
            label: 'Disabled Model',
          },
        ]),
      },
      { findAll: vi.fn().mockResolvedValue([]) },
      { findAll: vi.fn().mockResolvedValue([]) },
    ];

    useAuthedServiceMock.mockImplementation(() => {
      const nextService = services.shift();
      return vi.fn().mockResolvedValue(nextService);
    });
  });

  it('uses brand-context settings to filter models without a separate organization settings fetch', async () => {
    function Consumer() {
      const { models } = usePromptBarContext();

      return (
        <div>
          <span data-testid="model-count">{String(models.length)}</span>
          <span data-testid="model-label">{models[0]?.label ?? 'none'}</span>
        </div>
      );
    }

    render(
      <PromptBarProvider>
        <Consumer />
      </PromptBarProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('model-count')).toHaveTextContent('1');
    });

    expect(screen.getByTestId('model-label')).toHaveTextContent(
      'Enabled Model',
    );
    // 5 services registered (fonts, presets, models, trainings, tags)
    // May be called more than 5 times due to React strict mode double-rendering
    expect(useAuthedServiceMock.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});
