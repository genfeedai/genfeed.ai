import { vi } from 'vitest';

vi.mock('@genfeedai/agent', () => ({
  AgentFullPage: () => null,
}));

vi.mock('@genfeedai/auth-client/react', () => ({
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue('token'),
  }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({
    brandSlug: 'test-brand',
    orgSlug: 'test-org',
    threadId: 'thread-123',
  }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('../../agent-workspace-context', () => ({
  useAgentWorkspace: () => ({
    agentApiService: {},
    completeOnboardingFlow: vi.fn(),
    handleOAuthConnect: vi.fn(),
    isLoaded: true,
    isOnboarding: true,
  }),
}));

import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import ChatOnboardingThreadPage, * as PageModule from './page';

runPageModuleTests(
  'app/(protected)/agent/onboarding/[threadId]/page',
  PageModule,
);

describe('ChatOnboardingThreadPage', () => {
  it('renders only the workspace shell container and no inline page content', () => {
    const { container } = render(<ChatOnboardingThreadPage />);
    expect(container.firstChild).toHaveClass(
      'flex',
      'h-[calc(100dvh-var(--desktop-titlebar-height)-3rem)]',
      'min-h-0',
      'flex-1',
      'flex-col',
      'overflow-hidden',
    );
    expect(container.firstChild).toBeEmptyDOMElement();
  });
});
