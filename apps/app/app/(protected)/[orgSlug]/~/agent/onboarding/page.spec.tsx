import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import ChatOnboardingPage, * as PageModule from './page';

runPageModuleTests('app/(protected)/agent/onboarding/page', PageModule);

describe('ChatOnboardingPage', () => {
  it('renders nothing itself — the agent layout hosts the onboarding conversation', () => {
    const { container } = render(<ChatOnboardingPage />);
    expect(container).toBeEmptyDOMElement();
  });
});
