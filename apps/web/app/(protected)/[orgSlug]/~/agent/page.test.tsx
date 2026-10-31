import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import AgentPage, * as PageModule from './page';

runPageModuleTests('app/(protected)/[orgSlug]/~/agent/page', PageModule);

describe('AgentPage', () => {
  it('renders nothing (the layout hosts the master conversation)', () => {
    const { container } = render(<AgentPage />);

    expect(container).toBeEmptyDOMElement();
  });
});
