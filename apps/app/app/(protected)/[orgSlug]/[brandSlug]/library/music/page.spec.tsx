import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import LibraryMusicRoute, * as PageModule from './page';

vi.mock('@pages/ingredients/layout/ingredients-layout', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="ingredients-layout">{children}</div>
  ),
}));

vi.mock('@pages/ingredients/list/ingredients-list', () => ({
  default: () => <div data-testid="ingredients-list" />,
}));

runPageModuleTests('app/(protected)/library/music/page', PageModule);

describe('LibraryMusicRoute', () => {
  it('renders the shared music library content', () => {
    render(<LibraryMusicRoute />);

    expect(screen.getByTestId('ingredients-layout')).toBeInTheDocument();
    expect(screen.getByTestId('ingredients-list')).toBeInTheDocument();
  });
});
