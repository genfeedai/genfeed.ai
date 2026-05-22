import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import ProtectedRootPage, * as PageModule from './page';

vi.mock('@app/(protected)/root-resolver-client', () => ({
  default: () => <div data-testid="protected-root-resolver" />,
}));

runPageModuleTests('app/(protected)/page', PageModule);

describe('ProtectedRootPage', () => {
  it('renders the protected root resolver', () => {
    render(<ProtectedRootPage />);

    expect(screen.getByTestId('protected-root-resolver')).toBeInTheDocument();
  });
});
