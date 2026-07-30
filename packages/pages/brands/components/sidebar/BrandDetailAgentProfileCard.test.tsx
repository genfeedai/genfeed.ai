import BrandDetailAgentProfileCard from '@pages/brands/components/sidebar/BrandDetailAgentProfileCard';
import type { BrandDetailAgentProfileCardProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshBrandsMock = vi.fn().mockResolvedValue(undefined);
const updateAgentConfigMock = vi.fn().mockResolvedValue(undefined);
const generateBrandVoiceMock = vi.fn();
const successMock = vi.fn();
const errorMock = vi.fn();

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    refreshBrands: refreshBrandsMock,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    generateBrandVoice: generateBrandVoiceMock,
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
    label: 'Acme',
    links: [
      {
        category: 'website',
        id: 'link-1',
        label: 'Website',
        url: 'https://acme.example',
      },
    ],
  } as BrandDetailAgentProfileCardProps['brand'];

  beforeEach(() => {
    vi.clearAllMocks();
    generateBrandVoiceMock.mockResolvedValue({
      audience: ['founders'],
      doNotSoundLike: ['hype'],
      hashtags: ['#acme'],
      messagingPillars: ['clarity', 'proof'],
      prompting: { conversationStarters: [], seeds: [] },
      sampleOutput: 'A sharp, practical founder post.',
      strategy: { goals: ['awareness'], topics: ['product'] },
      style: 'plainspoken',
      taglines: ['Ship systems'],
      tone: 'confident',
      values: ['honesty'],
    });
  });

  it('renders all voice fields on the page without a Manage modal', () => {
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Manage' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Persona')).toBeInTheDocument();
    expect(screen.getByLabelText('Messaging Pillars')).toBeInTheDocument();
    expect(screen.getByLabelText('Tone')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Generate' }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByRole('button', { name: 'Save' }).length).toBeGreaterThan(
      0,
    );
  });

  it('saves expanded brand voice fields at brand and platform levels', async () => {
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    fireEvent.change(screen.getByLabelText('Messaging Pillars'), {
      target: { value: 'clarity, proof' },
    });
    fireEvent.change(screen.getByLabelText('Approved Hooks'), {
      target: {
        value: 'Say the quiet part out loud, Most teams get this wrong',
      },
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

    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);

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
                exemplarTexts: [
                  'Open with a sharp claim',
                  'then prove it fast.',
                ],
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
            bannedPhrases: ['game-changing AI', 'unlock your potential'],
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
    expect(successMock).toHaveBeenCalledWith('Brand voice saved');
  });

  it('generates voice from brand scan, fills the form, and saves', async () => {
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Generate' })[0]);

    await waitFor(() => {
      expect(generateBrandVoiceMock).toHaveBeenCalledWith('brand-1', {
        brandId: 'brand-1',
        url: 'https://acme.example',
      });
    });

    await waitFor(() => {
      expect(updateAgentConfigMock).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          voice: expect.objectContaining({
            tone: 'confident',
            style: 'plainspoken',
            audience: ['founders'],
            messagingPillars: ['clarity', 'proof'],
            sampleOutput: 'A sharp, practical founder post.',
            values: ['honesty'],
            doNotSoundLike: ['hype'],
          }),
          strategy: expect.objectContaining({
            goals: ['awareness'],
            contentTypes: ['product'],
          }),
        }),
      );
    });

    expect(screen.getByLabelText('Tone')).toHaveValue('confident');
    expect(screen.getByLabelText('Style')).toHaveValue('plainspoken');
    expect(successMock).toHaveBeenCalledWith('Brand voice generated and saved');
  });
});
