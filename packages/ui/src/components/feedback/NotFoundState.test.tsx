import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotFoundState from './NotFoundState';

describe('NotFoundState', () => {
  it('shows the title, the message and a link out', () => {
    render(
      <NotFoundState
        backLinkHref="/library"
        backLinkLabel="Back to library"
        message="It was deleted."
        title="Ingredient Not Found"
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Ingredient Not Found' }),
    ).toBeInTheDocument();
    expect(screen.getByText('It was deleted.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to library' }),
    ).toHaveAttribute('href', '/library');
  });

  it('offers a button when the way out is a callback', () => {
    const onBack = vi.fn();
    render(<NotFoundState onBack={onBack} title="Project not found" />);

    fireEvent.click(screen.getByRole('button', { name: 'Back to Home' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('has no action when the host gives no way out', () => {
    render(<NotFoundState title="Thread not found" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('passes role and test id through to its root', () => {
    render(
      <NotFoundState
        data-testid="state"
        role="alert"
        title="Thread not found"
      />,
    );

    expect(screen.getByTestId('state')).toHaveAttribute('role', 'alert');
  });

  it('leads the 404 route with a single level-one heading and its artwork', () => {
    render(
      <NotFoundState
        size="hero"
        title="This page wandered off"
        visual={<div data-testid="art" />}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'This page wandered off',
    );
    expect(screen.getByTestId('art')).toBeInTheDocument();
  });
});
