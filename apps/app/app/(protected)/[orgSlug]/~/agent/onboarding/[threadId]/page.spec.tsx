import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import ChatOnboardingThreadPage, * as PageModule from './page';

runPageModuleTests(
  'app/(protected)/agent/onboarding/[threadId]/page',
  PageModule,
);

describe('ChatOnboardingThreadPage', () => {
  it('renders nothing itself — the agent layout hosts the onboarding conversation', () => {
    const { container } = render(<ChatOnboardingThreadPage />);
    expect(container).toBeEmptyDOMElement();
  });
});
