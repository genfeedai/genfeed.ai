import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
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

runPageModuleTests('app/(protected)/[orgSlug]/~/agent/page', PageModule);

describe('AgentPage', () => {
  it('clears the active thread and renders nothing (the layout hosts the conversation)', () => {
    const { container } = render(<AgentPage />);

    expect(container).toBeEmptyDOMElement();
    expect(setActiveThread).toHaveBeenCalledWith(null);
    expect(resetActiveConversationState).toHaveBeenCalled();
  });
});
