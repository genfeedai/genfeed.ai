import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The loaded tooltip is module state; each test starts without it.
async function loadPrimitives() {
  vi.resetModules();
  const { Button } = await import('./button');
  const { TooltipProvider } = await import('./tooltip');
  return { Button, TooltipProvider };
}

afterEach(() => {
  vi.resetModules();
});

describe('Button tooltip', () => {
  it('renders the tooltip at once under a TooltipProvider', async () => {
    const { Button, TooltipProvider } = await loadPrimitives();

    render(
      <TooltipProvider>
        <Button withWrapper={false} tooltip="Save draft">
          Save
        </Button>
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'data-state',
      'closed',
    );
  });

  it('server-renders the bare button when there is no provider', async () => {
    const { Button } = await loadPrimitives();

    const html = renderToString(
      <Button withWrapper={false} tooltip="Save draft">
        Save
      </Button>,
    );

    expect(html).toContain('Save');
    expect(html).not.toContain('data-state');
  });

  it('attaches the hint after the tooltip module loads without a provider', async () => {
    const { Button } = await loadPrimitives();

    render(
      <Button withWrapper={false} tooltip="Save draft">
        Save
      </Button>,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
        'data-state',
        'closed',
      ),
    );
  });

  it('renders a button without a tooltip prop untouched', async () => {
    const { Button } = await loadPrimitives();

    render(<Button withWrapper={false}>Plain</Button>);

    expect(screen.getByRole('button', { name: 'Plain' })).not.toHaveAttribute(
      'data-state',
    );
  });
});
