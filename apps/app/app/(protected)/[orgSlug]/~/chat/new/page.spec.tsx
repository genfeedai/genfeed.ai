import { vi } from 'vitest';

const resetActiveConversationState = vi.fn();
const setActiveThread = vi.fn();

vi.mock('@genfeedai/agent', () => ({
  AgentFullPage: () => null,
  useAgentChatStore: {
    getState: () => ({
      resetActiveConversationState,
      setActiveThread,
    }),
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue('token'),
  }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'test-brand', orgSlug: 'test-org' }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('../chat-workspace-context', () => ({
  useChatWorkspace: () => ({
    agentApiService: {},
    completeOnboardingFlow: vi.fn(),
    handleOAuthConnect: vi.fn(),
    isLoaded: true,
    isOnboarding: false,
  }),
}));

import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import ChatNewPage, * as PageModule from './page';

runPageModuleTests('app/(protected)/chat/new/page', PageModule);

describe('ChatNewPage', () => {
  beforeEach(() => {
    resetActiveConversationState.mockClear();
    setActiveThread.mockClear();
  });

  it('resets the active conversation state on entry', () => {
    render(<ChatNewPage />);

    expect(setActiveThread).toHaveBeenCalledWith(null);
    expect(resetActiveConversationState).toHaveBeenCalledTimes(1);
  });

  it('renders only the workspace shell container and no inline page content', () => {
    const { container } = render(<ChatNewPage />);
    expect(container.firstChild).toHaveClass(
      'flex',
      'min-h-[calc(100vh-4rem)]',
      'flex-col',
    );
    expect(container.firstChild).toBeEmptyDOMElement();
  });
});
