// @vitest-environment jsdom
'use client';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OrchestrationSkillsPage from './orchestration-skills-page';

const pushMock = vi.fn();
const getTokenMock = vi.fn();
const resolveClerkTokenMock = vi.fn();
const listSkillsMock = vi.fn();
const customizeSkillMock = vi.fn();
const updateSkillMock = vi.fn();
const selectedBrandMock = {
  agentConfig: {
    enabledSkills: [],
  },
  id: 'brand-1',
  label: 'Acme Brand',
};
const brandContextMock = {
  brandId: 'brand-1',
  isReady: true,
  selectedBrand: selectedBrandMock,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: getTokenMock,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandContextMock,
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => brandContextMock,
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  resolveClerkToken: (...args: unknown[]) => resolveClerkTokenMock(...args),
}));

vi.mock('@services/content/skills.service', async () => {
  const actual = await vi.importActual<
    typeof import('@services/content/skills.service')
  >('@services/content/skills.service');

  return {
    ...actual,
    SkillsService: {
      getInstance: () => ({
        customizeSkill: customizeSkillMock,
        listSkills: listSkillsMock,
        updateSkill: updateSkillMock,
      }),
    },
  };
});

describe('OrchestrationSkillsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTokenMock.mockResolvedValue('clerk-token');
    resolveClerkTokenMock.mockResolvedValue('api-token');
    listSkillsMock.mockResolvedValue([
      {
        channels: ['youtube', 'linkedin'],
        defaultInstructions: 'Base instructions',
        description: 'Sets up long-form creator scripts.',
        id: 'skill-1',
        isBuiltIn: true,
        isEnabled: true,
        modalities: ['text'],
        name: 'YouTube Script Setup',
        organization: null,
        requiredProviders: ['openai'],
        slug: 'youtube-script-setup',
        source: 'built_in',
        status: 'published',
        workflowStage: 'creation',
      },
      {
        baseSkill: 'skill-1',
        channels: ['youtube'],
        defaultInstructions: 'Variant instructions',
        description: 'Brand-tuned variant.',
        id: 'variant-1',
        isBuiltIn: false,
        isEnabled: true,
        modalities: ['text'],
        name: 'YouTube Script Setup Custom',
        organization: 'org-1',
        requiredProviders: ['openai'],
        slug: 'youtube-script-setup-custom',
        source: 'custom',
        status: 'draft',
        workflowStage: 'creation',
      },
    ]);
    customizeSkillMock.mockResolvedValue({});
    updateSkillMock.mockResolvedValue({});
  });

  it('renders the brand skill catalog and routes skill testing into /chat', async () => {
    render(<OrchestrationSkillsPage />);

    expect(
      await screen.findByRole('heading', { name: /brand content behavior/i }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(listSkillsMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Acme Brand')).toBeInTheDocument();
    const skillButtons = await screen.findAllByRole(
      'button',
      {
        name: /YouTube Script Setup/i,
      },
      { timeout: 5000 },
    );
    expect(skillButtons.length).toBeGreaterThan(0);
    expect(screen.getByText(/built in/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /test in chat/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        '/chat/new?prompt=Use%20my%20YouTube%20Script%20Setup%20setup%20to%20create%20a%20small%20sample%20for%20youtube.%20Explain%20how%20the%20skill%20affects%20the%20output.',
      );
    });
  });
});
