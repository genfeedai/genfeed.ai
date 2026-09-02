import { LinkCategory } from '@genfeedai/contracts';
import BrandDetailAgentProfileCard from '@pages/brands/components/sidebar/BrandDetailAgentProfileCard';
import type { BrandDetailAgentProfileCardProps } from '@props/pages/brand-detail.props';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  errorMock,
  generateBrandVoiceMock,
  refreshBrandsMock,
  successMock,
  updateAgentConfigMock,
} = vi.hoisted(() => ({
  errorMock: vi.fn(),
  generateBrandVoiceMock: vi.fn(),
  refreshBrandsMock: vi.fn().mockResolvedValue(undefined),
  successMock: vi.fn(),
  updateAgentConfigMock: vi.fn().mockResolvedValue(undefined),
}));

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
      enabledModelIds: ['openai/gpt-5.6-luna'],
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
        style: 'direct',
        tone: 'steady',
        values: [],
      },
    },
    label: 'Acme',
    links: [
      {
        category: LinkCategory.WEBSITE,
        id: 'link-1',
        label: 'Website',
        url: 'https://acme.example',
      },
    ],
  } as BrandDetailAgentProfileCardProps['brand'];

  beforeEach(() => {
    vi.clearAllMocks();
    updateAgentConfigMock.mockResolvedValue(undefined);
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

  it('renders inline fields and keeps select controls without a Save button', () => {
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
    expect(screen.getByRole('button', { name: 'Persona' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Messaging Pillars' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tone' })).toHaveTextContent(
      'steady',
    );
    expect(
      screen.getByRole('combobox', {
        name: 'Brand Content Generation Model Override',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Generate' }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
  });

  it('auto-saves a committed field with the full updated payload', async () => {
    const user = userEvent.setup();
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Messaging Pillars' }));
    const editor = screen.getByRole('textbox', {
      name: 'Messaging Pillars',
    });
    await user.clear(editor);
    await user.type(editor, 'clarity, proof');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(updateAgentConfigMock).toHaveBeenCalledWith('brand-1', {
        defaultModel: undefined,
        persona: '',
        platformOverrides: {},
        strategy: {
          contentTypes: [],
          frequency: '',
          goals: [],
          platforms: [],
        },
        voice: {
          approvedHooks: [],
          audience: [],
          bannedPhrases: [],
          canonicalSource: 'brand',
          doNotSoundLike: [],
          exemplarTexts: [],
          messagingPillars: ['clarity', 'proof'],
          sampleOutput: '',
          style: 'direct',
          tone: 'steady',
          values: [],
          writingRules: [],
        },
      });
    });

    expect(refreshBrandsMock).toHaveBeenCalledOnce();
    expect(onRefreshBrand).toHaveBeenCalledOnce();
    expect(successMock).not.toHaveBeenCalled();
  });

  it('auto-saves platform override fields in the full payload', async () => {
    const user = userEvent.setup();
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    // Platform overrides use a channel select; editor is always visible.
    expect(
      screen.getByRole('combobox', { name: 'Platform override channel' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'twitter Messaging Pillars Override',
      }),
    );
    const editor = screen.getByRole('textbox', {
      name: 'twitter Messaging Pillars Override',
    });
    await user.clear(editor);
    await user.type(editor, 'speed, practicality');
    await user.keyboard('{Enter}');

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
                messagingPillars: ['speed', 'practicality'],
              }),
            }),
          },
          voice: expect.objectContaining({
            style: 'direct',
            tone: 'steady',
          }),
        }),
      );
    });
  });

  it('reverts the inline value and reports an error when saving fails', async () => {
    const user = userEvent.setup();
    updateAgentConfigMock.mockRejectedValueOnce(new Error('save failed'));
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Tone' }));
    const editor = screen.getByRole('textbox', { name: 'Tone' });
    await user.clear(editor);
    await user.type(editor, 'bold');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tone' })).toHaveTextContent(
        'steady',
      ),
    );
    expect(errorMock).toHaveBeenCalledWith('Failed to save brand voice');
    expect(refreshBrandsMock).not.toHaveBeenCalled();
    expect(onRefreshBrand).not.toHaveBeenCalled();
  });

  it('serializes quick field saves and preserves both updates', async () => {
    const user = userEvent.setup();
    let resolveFirstSave: (() => void) | undefined;
    updateAgentConfigMock
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValue(undefined);

    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Tone' }));
    await user.clear(screen.getByRole('textbox', { name: 'Tone' }));
    await user.type(screen.getByRole('textbox', { name: 'Tone' }), 'bold');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(updateAgentConfigMock).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: 'Style' }));
    await user.clear(screen.getByRole('textbox', { name: 'Style' }));
    await user.type(screen.getByRole('textbox', { name: 'Style' }), 'concise');
    await user.keyboard('{Enter}');

    expect(updateAgentConfigMock).toHaveBeenCalledOnce();
    resolveFirstSave?.();

    await waitFor(() => expect(updateAgentConfigMock).toHaveBeenCalledTimes(2));
    expect(updateAgentConfigMock).toHaveBeenLastCalledWith(
      'brand-1',
      expect.objectContaining({
        voice: expect.objectContaining({
          style: 'concise',
          tone: 'bold',
        }),
      }),
    );
  });

  it('generates voice from brand scan, fills the form, and saves', async () => {
    const user = userEvent.setup();
    render(
      <BrandDetailAgentProfileCard
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={onRefreshBrand}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Generate' })[0]);

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
          strategy: expect.objectContaining({
            contentTypes: ['product'],
            goals: ['awareness'],
          }),
          voice: expect.objectContaining({
            audience: ['founders'],
            doNotSoundLike: ['hype'],
            messagingPillars: ['clarity', 'proof'],
            sampleOutput: 'A sharp, practical founder post.',
            style: 'plainspoken',
            tone: 'confident',
            values: ['honesty'],
          }),
        }),
      );
    });

    expect(screen.getByRole('button', { name: 'Tone' })).toHaveTextContent(
      'confident',
    );
    expect(screen.getByRole('button', { name: 'Style' })).toHaveTextContent(
      'plainspoken',
    );
    expect(successMock).toHaveBeenCalledWith('Brand voice generated and saved');
  });
});
