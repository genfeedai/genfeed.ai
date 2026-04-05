import SettingsConversationPage from '@pages/settings/conversation/settings-conversation-page';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@clerk/nextjs', () => ({
  useUser: vi.fn(() => ({
    isLoaded: true,
  })),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: vi.fn(() => ({
    currentUser: {
      id: 'db-user-123',
      settings: {
        defaultAgentModel: '',
        generationPriority: 'balanced',
      },
    },
    mutateUser: vi.fn(),
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    refresh: vi.fn(),
    settings: {
      agentReplyStyle: 'concise',
      enabledModels: ['anthropic/claude-sonnet-4-5-20250929'],
    },
    updateSettings: vi.fn(),
  })),
}));

describe('SettingsConversationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the OpenRouter auto-routing copy for chat defaults', () => {
    render(<SettingsConversationPage />);

    expect(screen.getByText('Chat Model Override')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Leave this on OpenRouter Auto unless you need to pin a specific model for chat.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Generation Priority')).toBeInTheDocument();
  });
});
