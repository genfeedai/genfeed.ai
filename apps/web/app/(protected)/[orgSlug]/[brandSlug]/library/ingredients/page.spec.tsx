import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as PageModule from './page';

vi.mock('@pages/library/landing/library-landing-page', () => ({
  default: () => <div data-testid="library-landing-page" />,
}));

runPageModuleTests(
  'apps/app/app/(protected)/library/ingredients/page',
  PageModule,
);

describe('LibraryIngredientsPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dedicated library landing page', () => {
    render(<PageModule.default />);
    expect(screen.getByTestId('library-landing-page')).toBeInTheDocument();
  });
});
