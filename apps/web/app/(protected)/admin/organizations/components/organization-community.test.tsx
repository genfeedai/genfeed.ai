import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationCommunity from './organization-community';

const state = vi.hoisted(() => ({
  applied: [] as unknown[],
  confirm: null as null | { label: string; onConfirm: () => void },
  value: {
    data: undefined as unknown,
    isError: false,
    isLoading: false,
    isSaving: false,
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmModal: () => ({
      openConfirm: (config: { label: string; onConfirm: () => void }) => {
        state.confirm = config;
      },
    }),
  }),
);

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apps: { website: 'https://genfeed.ai' } },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: () => undefined, success: () => undefined }),
  },
}));

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({ ariaLabel }: { ariaLabel: string }) => (
    <span role="img" aria-label={ariaLabel} />
  ),
}));

vi.mock('../hooks/use-organization-community', () => ({
  useOrganizationCommunity: () => ({
    ...state.value,
    apply: async (action: unknown) => {
      state.applied.push(action);
    },
    refetch: async () => undefined,
  }),
}));

const overview = {
  creators: [
    {
      createdAt: '2026-10-01T00:00:00.000Z',
      handle: 'itsshaylamonroe',
      id: 'brand-1',
      isFeatured: false,
      label: 'Shayla Monroe',
    },
  ],
  media: [
    {
      brandId: 'brand-1',
      createdAt: '2026-11-01T00:00:00.000Z',
      id: 'video-1',
      isFeatured: true,
      kind: 'video',
      label: 'Sunset run',
      url: 'https://cdn.genfeed.ai/ingredients/videos/video-1',
    },
  ],
  mediaTotal: 1,
};

describe('OrganizationCommunity', () => {
  beforeEach(() => {
    state.applied = [];
    state.confirm = null;
    state.value = {
      data: overview,
      isError: false,
      isLoading: false,
      isSaving: false,
    };
  });

  it('lists the public creators with their profile link and the public media', () => {
    render(<OrganizationCommunity organizationId="org-1" />);

    expect(screen.getByText('Shayla Monroe')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'genfeed.ai/@itsshaylamonroe' }),
    ).toHaveAttribute('href', 'https://genfeed.ai/@itsshaylamonroe');
    expect(screen.getByText('Sunset run')).toBeInTheDocument();
    expect(screen.getByText('featuredBadge')).toBeInTheDocument();
  });

  it('features a creator and stops featuring a featured video', async () => {
    render(<OrganizationCommunity organizationId="org-1" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'featureNamed:Shayla Monroe' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'unfeatureNamed:Sunset run' }),
    );

    await vi.waitFor(() =>
      expect(state.applied).toEqual([
        {
          id: 'brand-1',
          isFeatured: true,
          kind: 'feature',
          target: 'creators',
        },
        { id: 'video-1', isFeatured: false, kind: 'feature', target: 'media' },
      ]),
    );
  });

  it('takes media off community only once the operator confirms', async () => {
    render(<OrganizationCommunity organizationId="org-1" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'unpublishNamed:Sunset run' }),
    );
    expect(state.confirm?.label).toBe('unpublishMediaTitle');
    expect(state.applied).toEqual([]);

    state.confirm?.onConfirm();
    await vi.waitFor(() =>
      expect(state.applied).toEqual([
        { id: 'video-1', kind: 'unpublish', target: 'media' },
      ]),
    );
  });

  it('says when the organization has nothing on community', () => {
    state.value = {
      ...state.value,
      data: { creators: [], media: [], mediaTotal: 0 },
    };

    render(<OrganizationCommunity organizationId="org-1" />);

    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('offers a retry when the overview fails to load', () => {
    state.value = { ...state.value, data: undefined, isError: true };

    render(<OrganizationCommunity organizationId="org-1" />);

    const alert = screen.getByText('loadError').closest('[role="alert"]');
    expect(screen.getByText('loadError')).toBeInTheDocument();
    expect(
      within(alert ?? document.body).getByRole('button', { name: 'retry' }),
    ).toBeInTheDocument();
  });
});
