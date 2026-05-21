import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import LabArticlesPage, * as PageModule from './page';

vi.mock('@pages/articles/list/articles-list', () => ({
  default: () => <div data-testid="articles-list" />,
}));

runPageModuleTests('app/(protected)/lab/articles/page', PageModule);

describe('LabArticlesPage', () => {
  it('renders the articles lab surface', () => {
    render(<LabArticlesPage />);

    expect(screen.getByTestId('articles-list')).toBeInTheDocument();
  });
});
