import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import LibraryVoicesRoute, * as PageModule from './page';

vi.mock('./library-voices-page', () => ({
  default: () => <div data-testid="library-voices-page" />,
}));

runPageModuleTests('app/(protected)/library/voices/page', PageModule);

describe('LibraryVoicesRoute', () => {
  it('renders the shared library voices page', () => {
    render(<LibraryVoicesRoute />);

    expect(screen.getByTestId('library-voices-page')).toBeInTheDocument();
  });
});
