import LivestreamChatBotPage from '@pages/agents/library/LivestreamChatBotPage';
import {
  type LivestreamFormState,
  useLivestreamChatBotPage,
} from '@pages/agents/library/useLivestreamChatBotPage';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('@pages/agents/library/useLivestreamChatBotPage', () => ({
  useLivestreamChatBotPage: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock(
  '@hooks/auth/use-platform-oauth-connect/use-platform-oauth-connect',
  () => ({
    usePlatformOAuthConnect: () => vi.fn(),
  }),
);

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const mockUseLivestreamChatBotPage = vi.mocked(useLivestreamChatBotPage);

const DEFAULT_FORM_STATE: LivestreamFormState = {
  contextTemplate: 'What is your take on {{topic}} right now?',
  description:
    'Posts scheduled link drops and context-aware questions into livestream chat.',
  hostPromptTemplate:
    'Hosts, what should the audience build with this tonight?',
  label: 'Livestream Chat Bot',
  linkLabel: 'Show Notes',
  linkUrl: 'https://genfeed.ai/show-notes',
  maxAutoPostsPerHour: 6,
  minimumMessageGapSeconds: 90,
  restreamCredentialId: '',
  scheduledCadenceMinutes: 10,
  transcriptEnabled: true,
  transcriptSource: 'restream_chat',
  twitchChannelId: '',
  twitchCredentialId: '',
  twitchSenderId: '',
  youtubeChannelId: '',
  youtubeCredentialId: '',
  youtubeLiveChatId: '',
};

function mockPage(
  overrides: Partial<ReturnType<typeof useLivestreamChatBotPage>> = {},
) {
  mockUseLivestreamChatBotPage.mockReturnValue({
    form: DEFAULT_FORM_STATE,
    handleApplyOverride: vi.fn(),
    handleIngestTranscript: vi.fn(),
    handleSave: vi.fn(),
    handleSendNow: vi.fn(),
    handleSessionAction: vi.fn(),
    isLoading: true,
    isSaving: false,
    manualTopic: '',
    promotionAngle: '',
    recentDeliveries: [],
    restreamCredentials: [],
    selectedPlatform: 'youtube',
    sendNowMessage: '',
    session: null,
    setForm: vi.fn(),
    setManualTopic: vi.fn(),
    setPromotionAngle: vi.fn(),
    setSendNowMessage: vi.fn(),
    setSelectedPlatform: vi.fn(),
    setTranscriptChunk: vi.fn(),
    transcriptChunk: '',
    ...overrides,
  } as unknown as ReturnType<typeof useLivestreamChatBotPage>);
}

describe('LivestreamChatBotPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page chrome while the bot is still loading', () => {
    mockPage({ isLoading: true, session: null });

    render(<LivestreamChatBotPage defaultPlatform="youtube" />);

    expect(screen.getByText('Livestream Chat Bot')).toBeInTheDocument();
    expect(screen.getByText('Runtime Controls')).toBeInTheDocument();
    expect(screen.getByText(/Session status:/)).toHaveTextContent(
      'Session status: -',
    );

    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
  });

  it('shows the loaded session status and enables session actions', () => {
    mockPage({
      isLoading: false,
      session: {
        context: {},
        deliveryHistory: [],
        platformStates: [],
        status: 'active',
      },
    });

    render(<LivestreamChatBotPage defaultPlatform="youtube" />);

    expect(screen.getByText(/Session status:/)).toHaveTextContent(
      'Session status: active',
    );
    expect(screen.getByRole('button', { name: 'Start' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop' })).not.toBeDisabled();
  });
});
