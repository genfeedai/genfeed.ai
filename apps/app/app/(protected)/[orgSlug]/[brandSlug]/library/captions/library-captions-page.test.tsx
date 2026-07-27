import { render, screen } from '@testing-library/react';
import LibraryCaptionsPage from './library-captions-page';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/moonrise/library/captions',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

describe('LibraryCaptionsPage', () => {
  it('keeps the captions title accessible without duplicating the breadcrumb', () => {
    render(
      <LibraryCaptionsPage>
        <div>Captions content</div>
      </LibraryCaptionsPage>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Captions' }),
    ).toHaveClass('sr-only');
    expect(
      screen.queryByText('Captions, subtitles, and transcripts.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Captions content')).toBeInTheDocument();
  });
});
