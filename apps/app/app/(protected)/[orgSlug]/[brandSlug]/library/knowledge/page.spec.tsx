import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import LibraryKnowledgeRoute, * as PageModule from './page';

vi.mock('./library-knowledge-page', () => ({
  default: () => <div data-testid="library-knowledge-page" />,
}));

runPageModuleTests('app/(protected)/library/knowledge/page', PageModule);

describe('LibraryKnowledgeRoute', () => {
  it('renders the shared library knowledge page', () => {
    render(<LibraryKnowledgeRoute />);

    expect(screen.getByTestId('library-knowledge-page')).toBeInTheDocument();
  });
});
