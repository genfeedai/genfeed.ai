import { GenerationPriority } from '@genfeedai/enums';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsConversationPage from '../app/(protected)/[orgSlug]/~/settings/(pages)/personal/settings-conversation-page';
import '@testing-library/jest-dom/vitest';

vi.mock('@hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: vi.fn(() => ({
    isLoaded: true,
    isSignedIn: true,
    user: null,
  })),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: vi.fn(() => ({
    currentUser: {
      id: 'db-user-123',
      settings: {
        defaultAgentModel: '',
        generationPriority: GenerationPriority.BALANCED,
      },
    },
    mutateUser: vi.fn(),
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn(async () => ({
      findAll: vi.fn().mockResolvedValue([]),
      patchSettings: vi.fn(),
    })),
  ),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    refresh: vi.fn(),
    settings: {
      agentReplyStyle: 'CONCISE',
      enabledModelIds: ['anthropic/claude-sonnet-5'],
    },
    updateSettings: vi.fn(),
  })),
}));

vi.mock('@ui/dropdowns/model-selector/ModelSelectorPopover', () => ({
  default: function MockModelSelectorPopover(props: {
    autoLabel?: string;
    values?: string[];
  }) {
    return (
      <div data-testid="shared-model-selector">
        <span>{props.autoLabel ?? 'Auto'}</span>
        <span>{props.values?.join(',')}</span>
      </div>
    );
  },
}));

vi.mock('@ui/dropdowns/model-selector/useModelFavorites', () => ({
  useModelFavorites: () => ({
    favoriteModelKeys: [],
    onFavoriteToggle: vi.fn(),
  }),
}));

describe('SettingsConversationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the shared model picker for chat defaults with Auto', () => {
    render(<SettingsConversationPage />);

    expect(screen.getByText('Default chat model')).toBeInTheDocument();
    expect(screen.getByTestId('shared-model-selector')).toBeInTheDocument();
    expect(screen.getByText('Auto · Balanced')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Auto routes by generation priority. Pick a model to pin every new chat.',
      ),
    ).toBeInTheDocument();
  });
});
