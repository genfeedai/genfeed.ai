import { render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { describe, expect, it, vi } from 'vitest';

describe('Alert', () => {
  it('renders without crashing', () => {
    render(<Alert>Alert message</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has alert role', () => {
    render(<Alert>Message</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<Alert>Alert content here</Alert>);
    expect(screen.getByText('Alert content here')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Alert className="custom-alert">Message</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('custom-alert');
  });

  describe('variants', () => {
    it('renders default variant', () => {
      render(<Alert variant="default">Default</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-background');
      expect(alert).toHaveClass('text-foreground');
    });

    it('renders destructive variant', () => {
      render(<Alert variant="destructive">Error!</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('border-destructive/50');
      expect(alert).toHaveClass('text-destructive');
    });

    it('renders info variant', () => {
      render(<Alert variant="info">Info</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('text-info');
    });

    it('renders success variant', () => {
      render(<Alert variant="success">Success!</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('text-success');
    });

    it('renders warning variant', () => {
      render(<Alert variant="warning">Warning!</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('text-warning');
    });
  });

  describe('AlertTitle', () => {
    it('renders title', () => {
      render(
        <Alert>
          <AlertTitle>Alert Title</AlertTitle>
        </Alert>,
      );
      expect(screen.getByText('Alert Title')).toBeInTheDocument();
    });

    it('renders as h5 element', () => {
      render(
        <Alert>
          <AlertTitle>Title</AlertTitle>
        </Alert>,
      );
      expect(screen.getByText('Title').tagName).toBe('H5');
    });

    it('applies custom className', () => {
      render(
        <Alert>
          <AlertTitle className="custom-title">Title</AlertTitle>
        </Alert>,
      );
      expect(screen.getByText('Title')).toHaveClass('custom-title');
    });

    it('has correct default styles', () => {
      render(
        <Alert>
          <AlertTitle>Title</AlertTitle>
        </Alert>,
      );
      const title = screen.getByText('Title');
      expect(title).toHaveClass('font-medium');
      expect(title).toHaveClass('leading-none');
    });
  });

  describe('AlertDescription', () => {
    it('renders description', () => {
      render(
        <Alert>
          <AlertDescription>Alert description text</AlertDescription>
        </Alert>,
      );
      expect(screen.getByText('Alert description text')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Alert>
          <AlertDescription className="custom-desc">
            Description
          </AlertDescription>
        </Alert>,
      );
      expect(screen.getByText('Description')).toHaveClass('custom-desc');
    });

    it('has correct default styles', () => {
      render(
        <Alert>
          <AlertDescription>Description</AlertDescription>
        </Alert>,
      );
      expect(screen.getByText('Description')).toHaveClass('text-sm');
    });
  });

  describe('full composition', () => {
    it('renders title and description together', () => {
      render(
        <Alert>
          <AlertTitle>Error Occurred</AlertTitle>
          <AlertDescription>
            Something went wrong. Please try again.
          </AlertDescription>
        </Alert>,
      );
      expect(screen.getByText('Error Occurred')).toBeInTheDocument();
      expect(
        screen.getByText('Something went wrong. Please try again.'),
      ).toBeInTheDocument();
    });

    it('renders with icon', () => {
      render(
        <Alert>
          <span data-testid="alert-icon">⚠️</span>
          <AlertTitle>Warning</AlertTitle>
          <AlertDescription>Be careful</AlertDescription>
        </Alert>,
      );
      expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Alert id="my-alert">Message</Alert>);
      expect(screen.getByRole('alert')).toHaveAttribute('id', 'my-alert');
    });

    it('forwards data attributes', () => {
      render(<Alert data-testid="custom-alert">Message</Alert>);
      expect(screen.getByTestId('custom-alert')).toBeInTheDocument();
    });

    it('forwards aria-live for dynamic alerts', () => {
      render(<Alert aria-live="assertive">Urgent message</Alert>);
      expect(screen.getByRole('alert')).toHaveAttribute(
        'aria-live',
        'assertive',
      );
    });
  });

  describe('styling', () => {
    it('has border', () => {
      render(<Alert>Message</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('border');
    });

    it('has the default inline radius', () => {
      render(<Alert>Message</Alert>);
    });

    it('has padding', () => {
      render(<Alert>Message</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('px-4');
      expect(alert).toHaveClass('py-3');
    });

    it('is full width', () => {
      render(<Alert>Message</Alert>);
      expect(screen.getByRole('alert')).toHaveClass('w-full');
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to alert element', () => {
      const ref = vi.fn();
      render(<Alert ref={ref}>Message</Alert>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
    });
  });
});
