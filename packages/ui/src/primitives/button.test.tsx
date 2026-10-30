import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { setButtonActionListener } from './button-action';

describe('Button loading state', () => {
  it('shows a plain spinner, never the animated brand mark', () => {
    const { container } = render(<Button isLoading label="Move 1 brand" />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    expect(container.querySelector('.genfeed-loader-root')).toBeNull();
    expect(container.querySelector('.genfeed-loader-trace')).toBeNull();
    expect(screen.getByRole('button')).toHaveTextContent('Move 1 brand');
  });
});

describe('Button action', () => {
  afterEach(() => {
    setButtonActionListener(null);
  });

  it('reports the action slug and still runs onClick', () => {
    const listener = vi.fn();
    const onClick = vi.fn();
    setButtonActionListener(listener);

    render(<Button action="clipper.export" label="Export" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));

    expect(listener).toHaveBeenCalledWith('clipper.export');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-action',
      'clipper.export',
    );
  });

  it('does not report a button without an action', () => {
    const listener = vi.fn();
    setButtonActionListener(listener);

    render(<Button label="Plain" />);
    fireEvent.click(screen.getByRole('button'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('still runs onClick when the listener throws', () => {
    const onClick = vi.fn();
    setButtonActionListener(() => {
      throw new Error('telemetry down');
    });

    render(<Button action="a.b" label="Go" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
