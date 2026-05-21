import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import ChatPage, * as PageModule from './page';

const resetActiveConversationState = vi.fn();
const setActiveThread = vi.fn();

vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: {
    getState: () => ({
      resetActiveConversationState,
      setActiveThread,
    }),
  },
}));

vi.mock('./ChatWorkspacePageShell', () => ({
  ChatWorkspacePageShell: () => <div data-testid="chat-workspace-page-shell" />,
}));

runPageModuleTests('app/(protected)/[orgSlug]/~/chat/page', PageModule);

describe('ChatPage', () => {
  it('renders the org-scoped chat workspace', () => {
    render(<ChatPage />);

    expect(screen.getByTestId('chat-workspace-page-shell')).toBeInTheDocument();
    expect(setActiveThread).toHaveBeenCalledWith(null);
    expect(resetActiveConversationState).toHaveBeenCalled();
  });
});
