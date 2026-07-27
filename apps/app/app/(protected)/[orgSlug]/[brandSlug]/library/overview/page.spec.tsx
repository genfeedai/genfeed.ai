import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as PageModule from './page';

vi.mock('./library-overview-page', () => ({
  default: () => <div data-testid="library-overview-page" />,
}));

runPageModuleTests('app/(protected)/library/overview/page', PageModule);

describe('LibraryOverviewRoute', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dedicated library overview', () => {
    render(<PageModule.default />);
    expect(screen.getByTestId('library-overview-page')).toBeInTheDocument();
  });
});
