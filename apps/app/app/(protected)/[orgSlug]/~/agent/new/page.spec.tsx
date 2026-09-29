import { vi } from 'vitest';

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

import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import ChatNewPage, * as PageModule from './page';

runPageModuleTests('app/(protected)/agent/new/page', PageModule);

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
});
