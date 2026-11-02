import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render } from '@testing-library/react';
import AgentThreadsPage, * as PageModule from './page';

runPageModuleTests(
  'app/(protected)/[orgSlug]/~/agent/threads/page',
  PageModule,
);

describe('AgentThreadsPage', () => {
  it('renders nothing (the layout hosts the master conversation and the list)', () => {
    const { container } = render(<AgentThreadsPage />);

    expect(container).toBeEmptyDOMElement();
  });
});
