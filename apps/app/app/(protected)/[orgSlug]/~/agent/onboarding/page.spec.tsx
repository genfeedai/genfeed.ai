import type { ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('@genfeedai/agent', () => ({
  AgentFullPage: () => null,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@genfeedai/auth-client/react', () => ({
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

vi.mock('../agent-workspace-context', () => ({
  useAgentWorkspace: () => ({
    agentApiService: {},
    completeOnboardingFlow: vi.fn(),
    handleOAuthConnect: vi.fn(),
    isLoaded: true,
    isOnboarding: true,
  }),
}));

import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import ChatOnboardingPage, * as PageModule from './page';

runPageModuleTests('app/(protected)/agent/onboarding/page', PageModule);

describe('ChatOnboardingPage', () => {
  it('renders the workspace shell container', () => {
    const { container } = render(<ChatOnboardingPage />);
    expect(container.firstChild).toHaveClass(
      'flex',
      'min-h-[calc(100vh-4rem)]',
      'flex-1',
      'flex-col',
    );
  });

  it('offers a classic-wizard fallback link', () => {
    render(<ChatOnboardingPage />);
    const fallbackLink = screen.getByRole('link', {
      name: /prefer a form\? use the classic setup/i,
    });
    expect(fallbackLink).toHaveAttribute('href', '/onboarding');
  });
});
