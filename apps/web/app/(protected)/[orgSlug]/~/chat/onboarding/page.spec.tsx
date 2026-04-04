import { vi } from 'vitest';

vi.mock('@genfeedai/agent', () => ({
  AgentFullPage: () => null,
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
    isOnboarding: true,
  }),
}));

import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import ChatOnboardingPage, * as PageModule from './page';

runPageModuleTests('apps/app/app/(protected)/chat/onboarding/page', PageModule);

describe('ChatOnboardingPage', () => {
  it('renders only the workspace shell container and no inline page content', () => {
    const { container } = render(<ChatOnboardingPage />);
    expect(container.firstChild).toHaveClass(
      'flex',
      'min-h-[calc(100vh-4rem)]',
      'flex-1',
      'flex-col',
    );
    expect(container.firstChild).toBeEmptyDOMElement();
  });
});
