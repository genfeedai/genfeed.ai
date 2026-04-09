import BrandDetailAgentProfileCard from '@pages/brands/components/sidebar/BrandDetailAgentProfileCard';
import type { BrandDetailAgentProfileCardProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshBrandsMock = vi.fn().mockResolvedValue(undefined);
const updateAgentConfigMock = vi.fn().mockResolvedValue(undefined);
const successMock = vi.fn();
const errorMock = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    refreshBrands: refreshBrandsMock,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    updateAgentConfig: updateAgentConfigMock,
  }),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: () => ({
    settings: {
      enabledModels: ['openai/gpt-4o-mini'],
    },
  }),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: errorMock,
      success: successMock,
    }),
  },
}));

describe('BrandDetailAgentProfileCard', () => {
  const onRefreshBrand = vi.fn().mockResolvedValue(undefined);

  const brand = {
    agentConfig: {
      platformOverrides: {},
      strategy: {
        contentTypes: [],
        frequency: '',
        goals: [],
        platforms: [],
      },
      voice: {
        audience: [],
        style: '',
        tone: '',
        values: [],
      },
    },
  } as BrandDetailAgentProfileCardProps['brand'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves expanded brand voice fields at brand and platform levels', async () => {
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage' }));

    fireEvent.change(screen.getByLabelText('Messaging Pillars'), {
      target: { value: 'clarity, proof' },
    });
    fireEvent.change(screen.getByLabelText('Approved Hooks'), {
      target: { value: 'Say the quiet part out loud, Most teams get this wrong' },
    });
    fireEvent.change(screen.getByLabelText('Banned Phrases'), {
      target: { value: 'game-changing AI, unlock your potential' },
    });
    fireEvent.change(screen.getByLabelText('Writing Rules'), {
      target: { value: 'Lead with a claim, use proof, cut fluff' },
    });
    fireEvent.change(screen.getByLabelText('Exemplar Texts'), {
      target: { value: 'We ship systems, not vibes' },
    });
    fireEvent.change(screen.getByLabelText('Do Not Sound Like'), {
      target: { value: 'clickbait, jargon' },
    });
    fireEvent.change(screen.getByLabelText('Sample Output'), {
      target: { value: 'A sharp, practical founder post.' },
    });

    fireEvent.change(screen.getAllByPlaceholderText('clarity, proof')[0], {
      target: { value: 'speed, practicality' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('clickbait, jargon')[0], {
      target: { value: 'hype, fluff' },
    });
    fireEvent.change(
      screen.getAllByPlaceholderText(
        'Short example of how this platform-specific voice should sound.',
      )[0],
      {
        target: { value: 'Fast-moving Twitter voice with crisp hooks.' },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText('Short example of a winning post.'),
      {
        target: { value: 'Open with a sharp claim, then prove it fast.' },
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Agent Profile' }));

    await waitFor(() => {
      expect(updateAgentConfigMock).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          platformOverrides: {
            twitter: expect.objectContaining({
              strategy: expect.objectContaining({
                platforms: ['twitter'],
              }),
              voice: expect.objectContaining({
                approvedHooks: ['speed', 'practicality'],
                doNotSoundLike: ['hype', 'fluff'],
                exemplarTexts: ['Open with a sharp claim', 'then prove it fast.'],
                messagingPillars: ['speed', 'practicality'],
                sampleOutput: 'Fast-moving Twitter voice with crisp hooks.',
              }),
            }),
          },
          voice: expect.objectContaining({
            approvedHooks: [
              'Say the quiet part out loud',
              'Most teams get this wrong',
            ],
            bannedPhrases: [
              'game-changing AI',
              'unlock your potential',
            ],
            canonicalSource: 'brand',
            doNotSoundLike: ['clickbait', 'jargon'],
            exemplarTexts: ['We ship systems', 'not vibes'],
            messagingPillars: ['clarity', 'proof'],
            sampleOutput: 'A sharp, practical founder post.',
            writingRules: ['Lead with a claim', 'use proof', 'cut fluff'],
          }),
        }),
      );
    });

    expect(refreshBrandsMock).toHaveBeenCalled();
    expect(onRefreshBrand).toHaveBeenCalled();
    expect(successMock).toHaveBeenCalledWith('Brand agent profile saved');
  });

  it('renders the compact summary before the dialog opens', () => {
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    expect(screen.getByText('Agent Profile')).toBeInTheDocument();
    expect(
      screen.getByText('No brand-level persona configured yet.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Messaging Pillars'),
    ).not.toBeInTheDocument();
  });
});
