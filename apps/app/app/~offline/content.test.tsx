import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import OfflineContent from './content';

describe('OfflineContent', () => {
  it('should render without crashing', () => {
    const { container } = render(<OfflineContent />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('tells the user they are offline and offers a retry', () => {
    render(<OfflineContent />);

    expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it('uses the same full-viewport deep-black shell as the not-found page', () => {
    const { container } = render(<OfflineContent />);
    const rootElement = container.firstChild as HTMLElement;

    expect(rootElement).toHaveClass('min-h-dvh', 'w-full', 'bg-black');
  });
});
