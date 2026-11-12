import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrganizationPublishingLayout from './layout';

vi.mock('@app-i18n/AppPageIntlProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('organization publishing layout', () => {
  it('renders the page', () => {
    render(
      <OrganizationPublishingLayout>
        <div data-testid="page" />
      </OrganizationPublishingLayout>,
    );

    expect(screen.getByTestId('page')).toBeInTheDocument();
  });
});
