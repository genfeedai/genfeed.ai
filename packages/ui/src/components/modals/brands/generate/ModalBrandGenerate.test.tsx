import ModalBrandGenerate from '@ui/modals/brands/generate/ModalBrandGenerate';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/modals/modal/Modal', () => ({
  default: ({ children, title }: { children: ReactNode; title?: string }) => (
    <div data-testid="modal">
      {title ? <h2>{title}</h2> : null}
      {children}
    </div>
  ),
}));

describe('ModalBrandGenerate', () => {
  const defaultProps = {
    onConfirm: vi.fn(),
    type: 'logo' as const,
  };

  it('renders a single profile-picture prompt', () => {
    render(<ModalBrandGenerate {...defaultProps} />);

    expect(
      screen.getByRole('heading', { name: 'Generate Profile Picture' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Describe the profile picture'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('A square portrait of…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Description (optional)'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Enter a prompt')).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(
        'Describe what you want in the banner/logo',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate' }),
    ).toBeInTheDocument();
  });

  it('renders a single banner prompt', () => {
    render(<ModalBrandGenerate {...defaultProps} type="banner" />);

    expect(
      screen.getByRole('heading', { name: 'Generate Banner' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Describe the banner')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('A wide banner of…'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Description (optional)'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Generate' }),
    ).toBeInTheDocument();
  });
});
