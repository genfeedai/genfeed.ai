import SettingsConversationPage from '@app/(protected)/[orgSlug]/~/settings/(pages)/personal/settings-conversation-page';
import {
  GenerationPriority,
  ModelCategory,
  ModelProvider,
} from '@genfeedai/enums';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  currentUser: {
    id: 'db-user-123',
    settings: {
      defaultAgentModel: '',
      generationPriority: 'balanced',
    },
  },
  findAll: vi.fn(),
  getService: vi.fn(),
  mutateUser: vi.fn(),
  organizationId: 'org-123',
  organizationSettings: {
    agentReplyStyle: 'CONCISE',
    enabledModelIds: ['anthropic/claude-sonnet-5'],
  },
  patchSettings: vi.fn(),
  refresh: vi.fn(),
  settingsLoading: false,
  updateSettings: vi.fn(),
}));

vi.mock('@hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: vi.fn(() => ({
    isLoaded: true,
    isSignedIn: true,
    user: null,
  })),
}));

vi.mock('@contexts/user/user-context/user-context', () => ({
  useCurrentUser: vi.fn(() => ({
    currentUser: mocks.currentUser,
    mutateUser: mocks.mutateUser,
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => mocks.getService),
}));

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    refresh: mocks.refresh,
    settings: mocks.organizationSettings,
    updateSettings: mocks.updateSettings,
  })),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    organizationId: mocks.organizationId,
    settingsLoading: mocks.settingsLoading,
  })),
}));

vi.mock('@ui/dropdowns/model-selector/ModelSelectorPopover', () => ({
  default: function MockModelSelectorPopover(props: {
    autoLabel?: string;
    isDisabled?: boolean;
    models: ReadonlyArray<{ key: string; label: string }>;
    name?: string;
    onChange: (name: string, values: string[]) => void;
    values: string[];
  }) {
    return (
      <div data-testid="shared-model-selector">
        <span>{props.autoLabel ?? 'Auto'}</span>
        <span>{props.values.join(',')}</span>
        {props.models.map((model) => (
          <span key={model.key}>{model.label}</span>
        ))}
        <button
          disabled={props.isDisabled}
          type="button"
          onClick={() =>
            props.onChange(props.name ?? 'models', ['__auto_model__'])
          }
        >
          Choose Auto
        </button>
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

interface RegistryModelOverrides {
  id?: string;
  isLegacy?: boolean;
}

function createRegistryModel(
  key: string,
  label: string,
  extras: RegistryModelOverrides = {},
) {
  return {
    category: ModelCategory.TEXT,
    id: extras.id ?? key,
    isActive: true,
    isLegacy: extras.isLegacy ?? false,
    key,
    label,
    provider: ModelProvider.OPENROUTER,
  };
}

describe('SettingsConversationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.settings.defaultAgentModel = '';
    mocks.currentUser.settings.generationPriority = GenerationPriority.BALANCED;
    mocks.organizationId = 'org-123';
    mocks.settingsLoading = false;
    mocks.organizationSettings.agentReplyStyle = 'CONCISE';
    mocks.organizationSettings.enabledModelIds = ['anthropic/claude-sonnet-5'];
    mocks.findAll.mockResolvedValue([]);
    mocks.getService.mockResolvedValue({
      findAll: mocks.findAll,
      patchSettings: mocks.patchSettings,
    });
    mocks.patchSettings.mockResolvedValue({});
    mocks.refresh.mockResolvedValue(undefined);
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

  it('keeps a non-empty organization allowlist restrictive when no catalog keys match', async () => {
    mocks.findAll.mockResolvedValue([
      createRegistryModel('openai/disallowed-model', 'Disallowed Model'),
    ]);
    mocks.organizationSettings.enabledModelIds = ['anthropic/allowed-model'];

    render(<SettingsConversationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose Auto' })).toBeEnabled();
    });
    expect(screen.queryByText('Disallowed Model')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Auto' })).toBeVisible();
  });

  it('honors the allowlist by model id, not only key, matching the prompt bar', async () => {
    mocks.findAll.mockResolvedValue([
      createRegistryModel('anthropic/claude-sonnet-5', 'Claude Sonnet 5', {
        id: 'mdl_sonnet',
      }),
    ]);
    mocks.organizationSettings.enabledModelIds = ['mdl_sonnet'];

    render(<SettingsConversationPage />);

    expect(await screen.findByText('Claude Sonnet 5')).toBeInTheDocument();
  });

  it('hides the catalog when the org allowlist is empty', async () => {
    mocks.findAll.mockResolvedValue([
      createRegistryModel('anthropic/claude-sonnet-5', 'Claude Sonnet 5'),
    ]);
    mocks.organizationSettings.enabledModelIds = [];

    render(<SettingsConversationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Choose Auto' })).toBeEnabled();
    });
    expect(screen.queryByText('Claude Sonnet 5')).not.toBeInTheDocument();
  });

  it('persists Auto as an empty string when clearing a removed override', async () => {
    const user = userEvent.setup();
    mocks.currentUser.settings.defaultAgentModel = 'retired/model';

    render(<SettingsConversationPage />);

    const autoButton = screen.getByRole('button', { name: 'Choose Auto' });
    await waitFor(() => expect(autoButton).toBeEnabled());
    await user.click(autoButton);
    await user.click(
      screen.getByRole('button', { name: 'Save Conversation Settings' }),
    );

    await waitFor(() => {
      expect(mocks.patchSettings).toHaveBeenCalledWith('db-user-123', {
        defaultAgentModel: '',
        generationPriority: GenerationPriority.BALANCED,
      });
    });
    expect(mocks.mutateUser).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
