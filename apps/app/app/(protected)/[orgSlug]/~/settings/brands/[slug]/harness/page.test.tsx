import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import { render, screen } from '@testing-library/react';
import BrandSettingsHarnessRoute, * as PageModule from './page';

vi.mock('./content', () => ({
  default: () => <div data-testid="brand-settings-harness" />,
}));

runPageModuleTests(
  'app/(protected)/[orgSlug]/~/settings/brands/[slug]/harness/page',
  PageModule,
);

describe('BrandSettingsHarnessRoute', () => {
  it('renders the brand harness settings surface', () => {
    render(<BrandSettingsHarnessRoute />);

    expect(screen.getByTestId('brand-settings-harness')).toBeInTheDocument();
  });
});
