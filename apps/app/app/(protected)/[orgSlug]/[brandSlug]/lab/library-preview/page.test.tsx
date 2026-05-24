import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import LabLibraryPreviewPage, * as PageModule from './page';

vi.mock('@pages/library/landing/library-landing-visual-preview', () => ({
  default: () => <div data-testid="library-preview" />,
}));

runPageModuleTests('app/(protected)/lab/library-preview/page', PageModule);

describe('LabLibraryPreviewPage', () => {
  it('renders the library preview lab surface', () => {
    render(<LabLibraryPreviewPage />);

    expect(screen.getByTestId('library-preview')).toBeInTheDocument();
  });
});
