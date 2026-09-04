import { fireEvent, render, screen } from '@testing-library/react';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';
import { describe, expect, it, vi } from 'vitest';

describe('ListRow', () => {
  it('renders the button form when onClick + ariaLabel are provided', () => {
    const onClick = vi.fn();
    render(
      <ListRow title="Row title" onClick={onClick} ariaLabel="Open row" />,
    );

    const button = screen.getByRole('button', { name: 'Open row' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the link form when href is provided', () => {
    render(<ListRow title="Row title" href="/somewhere" />);

    const link = screen.getByRole('link', { name: /Row title/ });
    expect(link).toHaveAttribute('href', '/somewhere');
  });

  it('renders a static, non-interactive form when neither onClick nor href are provided', () => {
    render(<ListRow title="Row title" data-testid="static-row" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('static-row')).toBeInTheDocument();
  });

  it('applies border-b and last:border-b-0 on every form', () => {
    const { container: buttonContainer } = render(
      <ListRow title="A" onClick={vi.fn()} ariaLabel="A" />,
    );
    expect(buttonContainer.firstChild).toHaveClass('border-b');
    expect(buttonContainer.firstChild).toHaveClass('last:border-b-0');

    const { container: linkContainer } = render(
      <ListRow title="B" href="/b" />,
    );
    expect(linkContainer.firstChild).toHaveClass('border-b');
    expect(linkContainer.firstChild).toHaveClass('last:border-b-0');

    const { container: staticContainer } = render(<ListRow title="C" />);
    expect(staticContainer.firstChild).toHaveClass('border-b');
    expect(staticContainer.firstChild).toHaveClass('last:border-b-0');
  });

  it('applies the hover class only when interactive', () => {
    const { container: interactiveContainer } = render(
      <ListRow title="A" onClick={vi.fn()} ariaLabel="A" />,
    );
    expect(interactiveContainer.firstChild).toHaveClass('hover:bg-hover');

    const { container: staticContainer } = render(<ListRow title="B" />);
    expect(staticContainer.firstChild).not.toHaveClass('hover:bg-hover');
  });

  it('renders leading, description, meta, and trailing slots', () => {
    render(
      <ListRow
        title="Row title"
        leading={<span data-testid="leading-slot">L</span>}
        description="Row description"
        meta="Row meta"
        trailing={<span data-testid="trailing-slot">T</span>}
      />,
    );

    expect(screen.getByTestId('leading-slot')).toBeInTheDocument();
    expect(screen.getByText('Row description')).toBeInTheDocument();
    expect(screen.getByText('Row meta')).toBeInTheDocument();
    expect(screen.getByTestId('trailing-slot')).toBeInTheDocument();
  });

  it('applies compact density padding', () => {
    const { container } = render(<ListRow title="Row" density="compact" />);
    expect(container.firstChild).toHaveClass('py-2.5');
    expect(container.firstChild).toHaveClass('px-4');
  });

  it('applies comfortable density padding by default', () => {
    const { container } = render(<ListRow title="Row" />);
    expect(container.firstChild).toHaveClass('p-4');
  });

  it('passes through data-testid', () => {
    render(<ListRow title="Row" data-testid="my-row" />);
    expect(screen.getByTestId('my-row')).toBeInTheDocument();
  });
});

describe('ListRowsSkeleton', () => {
  it('renders the default number of skeleton rows', () => {
    const { container } = render(<ListRowsSkeleton />);
    expect(
      container.querySelectorAll('[aria-hidden="true"] > div').length,
    ).toBe(3);
  });

  it('renders a custom number of rows', () => {
    const { container } = render(<ListRowsSkeleton rows={5} />);
    expect(
      container.querySelectorAll('[aria-hidden="true"] > div').length,
    ).toBe(5);
  });

  it('supports a custom data-testid', () => {
    render(<ListRowsSkeleton data-testid="custom-skeleton" />);
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument();
  });

  it('defaults to the list-rows-skeleton testid', () => {
    render(<ListRowsSkeleton />);
    expect(screen.getByTestId('list-rows-skeleton')).toBeInTheDocument();
  });
});
