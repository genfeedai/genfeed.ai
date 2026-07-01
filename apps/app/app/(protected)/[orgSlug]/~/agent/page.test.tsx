import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import AgentPage, * as PageModule from './page';

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

vi.mock('./AgentWorkspacePageShell', () => ({
  AgentWorkspacePageShell: () => (
    <div data-testid="agent-workspace-page-shell" />
  ),
}));

runPageModuleTests('app/(protected)/[orgSlug]/~/agent/page', PageModule);

describe('AgentPage', () => {
  it('renders the org-scoped agent workspace', () => {
    render(<AgentPage />);

    expect(
      screen.getByTestId('agent-workspace-page-shell'),
    ).toBeInTheDocument();
    expect(setActiveThread).toHaveBeenCalledWith(null);
    expect(resetActiveConversationState).toHaveBeenCalled();
  });
});
