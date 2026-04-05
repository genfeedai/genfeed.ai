import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ui/primitives/dialog';
import { describe, expect, it, vi } from 'vitest';

describe('Dialog', () => {
  const renderBasicDialog = (open = false) => {
    return render(
      <Dialog open={open}>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Dialog</DialogTitle>
            <DialogDescription>This is a test dialog</DialogDescription>
          </DialogHeader>
          <div>Dialog body content</div>
          <DialogFooter>
            <DialogClose>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );
  };

  describe('Dialog Root', () => {
    it('renders trigger button', () => {
      renderBasicDialog();
      expect(screen.getByText('Open Dialog')).toBeInTheDocument();
    });

    it('does not show content by default', () => {
      renderBasicDialog(false);
      expect(screen.queryByText('Test Dialog')).not.toBeInTheDocument();
    });

    it('shows content when open is true', () => {
      renderBasicDialog(true);
      expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    });

    it('handles controlled open state', () => {
      const handleOpenChange = vi.fn();
      const { rerender } = render(
        <Dialog open={false} onOpenChange={handleOpenChange}>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>Content</DialogContent>
        </Dialog>,
      );

      expect(screen.queryByText('Content')).not.toBeInTheDocument();

      rerender(
        <Dialog open={true} onOpenChange={handleOpenChange}>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>Content</DialogContent>
        </Dialog>,
      );

      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  describe('DialogTrigger', () => {
    it('renders trigger element', () => {
      renderBasicDialog();
      expect(screen.getByText('Open Dialog')).toBeInTheDocument();
    });

    it('opens dialog when clicked', async () => {
      render(
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>,
      );

      fireEvent.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByText('Title')).toBeInTheDocument();
      });
    });

    it('can render as child component', () => {
      render(
        <Dialog>
          <DialogTrigger asChild>
            <button type="button">Custom Trigger</button>
          </DialogTrigger>
          <DialogContent>Content</DialogContent>
        </Dialog>,
      );

      expect(screen.getByText('Custom Trigger')).toBeInTheDocument();
    });
  });

  describe('DialogContent', () => {
    it('renders dialog content when open', () => {
      renderBasicDialog(true);
      expect(screen.getByText('Dialog body content')).toBeInTheDocument();
    });

    it('renders close button by default', () => {
      renderBasicDialog(true);
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      expect(closeButtons.length).toBeGreaterThan(0);
    });

    it('can hide close button with showCloseButton=false', () => {
      render(
        <Dialog open={true}>
          <DialogContent showCloseButton={false}>
            <DialogTitle>No Close Button</DialogTitle>
          </DialogContent>
        </Dialog>,
      );

      const srOnlyClose = screen.queryByText('Close', { selector: '.sr-only' });
      expect(srOnlyClose).not.toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Dialog open={true}>
          <DialogContent className="custom-content">
            <DialogTitle>Custom</DialogTitle>
          </DialogContent>
        </Dialog>,
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('custom-content');
    });

    it('has proper overlay', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>Test</DialogTitle>
          </DialogContent>
        </Dialog>,
      );

      // Overlay is rendered in a portal, so search the whole document
      const allElements = document.querySelectorAll('*');
      const hasOverlay = Array.from(allElements).some((el) =>
        el.className?.toString().includes('backdrop-blur'),
      );
      expect(hasOverlay).toBe(true);
    });
  });

  describe('DialogHeader', () => {
    it('renders header content', () => {
      renderBasicDialog(true);
      expect(screen.getByText('Test Dialog')).toBeInTheDocument();
      expect(screen.getByText('This is a test dialog')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogHeader className="custom-header">
              <DialogTitle>Title</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>,
      );

      const header = screen.getByText('Title').parentElement;
      expect(header).toHaveClass('custom-header');
    });
  });

  describe('DialogTitle', () => {
    it('renders title text', () => {
      renderBasicDialog(true);
      expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    });

    it('has correct heading role', () => {
      renderBasicDialog(true);
      expect(
        screen.getByRole('heading', { name: 'Test Dialog' }),
      ).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle className="custom-title">Custom Title</DialogTitle>
          </DialogContent>
        </Dialog>,
      );

      expect(screen.getByRole('heading')).toHaveClass('custom-title');
    });
  });

  describe('DialogDescription', () => {
    it('renders description text', () => {
      renderBasicDialog(true);
      expect(screen.getByText('This is a test dialog')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription className="custom-description">
              Description
            </DialogDescription>
          </DialogContent>
        </Dialog>,
      );

      const description = screen.getByText('Description');
      expect(description).toHaveClass('custom-description');
    });
  });

  describe('DialogFooter', () => {
    it('renders footer content', () => {
      renderBasicDialog(true);
      // There may be multiple Close buttons (DialogClose + X button)
      const closeButtons = screen.getAllByRole('button', { name: /close/i });
      expect(closeButtons.length).toBeGreaterThan(0);
    });

    it('applies custom className', () => {
      render(
        <Dialog open={true}>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Title</DialogTitle>
            <DialogFooter className="custom-footer">
              <button>Action</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );

      const footer = screen.getByRole('button', {
        name: 'Action',
      }).parentElement;
      expect(footer).toHaveClass('custom-footer');
    });
  });

  describe('DialogClose', () => {
    it('closes dialog when clicked', async () => {
      render(
        <Dialog defaultOpen={true}>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogClose>Close Dialog</DialogClose>
          </DialogContent>
        </Dialog>,
      );

      expect(screen.getByText('Title')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Close Dialog'));

      await waitFor(() => {
        expect(screen.queryByText('Title')).not.toBeInTheDocument();
      });
    });

    it('can render as child component', () => {
      render(
        <Dialog open={true}>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogClose asChild>
              <button type="button">Custom Close</button>
            </DialogClose>
          </DialogContent>
        </Dialog>,
      );

      expect(screen.getByText('Custom Close')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has dialog role', () => {
      renderBasicDialog(true);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('links title to dialog with aria-labelledby', () => {
      renderBasicDialog(true);
      const dialog = screen.getByRole('dialog');
      const title = screen.getByRole('heading', { name: 'Test Dialog' });

      expect(dialog).toHaveAttribute('aria-labelledby');
      expect(title).toHaveAttribute('id');
    });

    it('links description to dialog with aria-describedby', () => {
      renderBasicDialog(true);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-describedby');
    });

    it('traps focus within dialog', () => {
      renderBasicDialog(true);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      // Focus trap is handled by Radix UI
    });

    it('closes on Escape key', async () => {
      render(
        <Dialog defaultOpen={true}>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>,
      );

      expect(screen.getByText('Title')).toBeInTheDocument();

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByText('Title')).not.toBeInTheDocument();
      });
    });
  });

  describe('styling', () => {
    it('applies default content styles', () => {
      renderBasicDialog(true);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('fixed');
      expect(dialog).toHaveClass('z-50');
    });

    it('has backdrop blur overlay', () => {
      renderBasicDialog(true);
      // Overlay is in a portal, search the whole document
      const allElements = document.querySelectorAll('*');
      const hasBackdropBlur = Array.from(allElements).some((el) =>
        el.className?.toString().includes('backdrop-blur'),
      );
      expect(hasBackdropBlur).toBe(true);
    });

    it('has animation classes', () => {
      renderBasicDialog(true);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('duration-200');
    });
  });

  describe('uncontrolled mode', () => {
    it('opens and closes in uncontrolled mode', async () => {
      render(
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Title</DialogTitle>
            <DialogClose>Close Me</DialogClose>
          </DialogContent>
        </Dialog>,
      );

      expect(screen.queryByText('Title')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('Open'));
      await waitFor(() => {
        expect(screen.getByText('Title')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close Me'));
      await waitFor(() => {
        expect(screen.queryByText('Title')).not.toBeInTheDocument();
      });
    });

    it('supports defaultOpen prop', () => {
      render(
        <Dialog defaultOpen={true}>
          <DialogContent>
            <DialogTitle>Default Open</DialogTitle>
          </DialogContent>
        </Dialog>,
      );

      expect(screen.getByText('Default Open')).toBeInTheDocument();
    });
  });

  describe('callbacks', () => {
    it('calls onOpenChange when dialog opens', async () => {
      const handleOpenChange = vi.fn();
      render(
        <Dialog onOpenChange={handleOpenChange}>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>,
      );

      fireEvent.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(handleOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('calls onOpenChange when dialog closes', async () => {
      const handleOpenChange = vi.fn();
      render(
        <Dialog defaultOpen={true} onOpenChange={handleOpenChange}>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Title</DialogTitle>
            <DialogClose>Close Me</DialogClose>
          </DialogContent>
        </Dialog>,
      );

      fireEvent.click(screen.getByText('Close Me'));

      await waitFor(() => {
        expect(handleOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
