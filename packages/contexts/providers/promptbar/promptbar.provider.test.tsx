// @vitest-environment jsdom
'use client';

import { usePromptBarContext } from '@providers/promptbar/promptbar.context';
import PromptBarProvider from '@providers/promptbar/promptbar.provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
const useBrandMock = vi.fn();
const catalogServices = vi.hoisted(() => ({
  fontFamilies: { findAllPages: vi.fn() },
  models: { findAllPages: vi.fn() },
  presets: { findAllPages: vi.fn() },
  tags: { findAllPages: vi.fn() },
  trainings: { findAllPages: vi.fn() },
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => useAuthMock(),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => useBrandMock(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService:
    <T,>(factory: (token: string) => T) =>
    async () =>
      factory('token'),
}));

vi.mock('@genfeedai/services/elements/font-families.service', () => ({
  FontFamiliesService: { getInstance: () => catalogServices.fontFamilies },
}));
vi.mock('@genfeedai/services/elements/presets.service', () => ({
  PresetsService: { getInstance: () => catalogServices.presets },
}));
vi.mock('@genfeedai/services/ai/models.service', () => ({
  ModelsService: { getInstance: () => catalogServices.models },
}));
vi.mock('@genfeedai/services/ai/trainings.service', () => ({
  TrainingsService: { getInstance: () => catalogServices.trainings },
}));
vi.mock('@genfeedai/services/content/tags.service', () => ({
  TagsService: { getInstance: () => catalogServices.tags },
}));

let queryClient: QueryClient;

function QueryWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// The provider logs from inside the catalog `try`, so a double that omits the
// level it calls throws a TypeError the catch swallows — every picker then
// reports an empty catalog instead of a failed one. Mirror the real logger's
// full surface (debug/error/info/warn) rather than the levels used today.
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

function ModelsConsumer() {
  const { models } = usePromptBarContext();

  return (
    <div>
      <span>{`${models.length} models`}</span>
      <span>{models[0]?.label ?? 'none'}</span>
    </div>
  );
}

function SilentConsumer() {
  usePromptBarContext();
  return null;
}

describe('PromptBarProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      orgId: 'org_123',
      userId: 'authProvider_123',
    });
    useBrandMock.mockReturnValue({
      organizationId: 'org_123',
      settings: {
        enabledModelIds: ['model_enabled'],
      },
    });

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    for (const service of Object.values(catalogServices)) {
      service.findAllPages.mockResolvedValue([]);
    }
    catalogServices.models.findAllPages.mockResolvedValue([
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
    ]);
  });

  it('uses brand-context settings to filter models without a separate organization settings fetch', async () => {
    render(
      <PromptBarProvider>
        <ModelsConsumer />
      </PromptBarProvider>,
      { wrapper: QueryWrapper },
    );

    await waitFor(() => {
      expect(screen.getByText('1 models')).toBeInTheDocument();
    });

    expect(screen.getByText('Enabled Model')).toBeInTheDocument();
  });

  it('does not fetch the catalogs until a consumer mounts', async () => {
    const { rerender } = render(
      <PromptBarProvider>
        <span>idle</span>
      </PromptBarProvider>,
      { wrapper: QueryWrapper },
    );
    await Promise.resolve();
    expect(catalogServices.models.findAllPages).not.toHaveBeenCalled();

    rerender(
      <PromptBarProvider>
        <SilentConsumer />
      </PromptBarProvider>,
    );

    await waitFor(() =>
      expect(catalogServices.models.findAllPages).toHaveBeenCalled(),
    );
  });
});
