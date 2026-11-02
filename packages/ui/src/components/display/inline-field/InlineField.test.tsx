import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InlineField from '@ui/display/inline-field/InlineField';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';

// next/dynamic with ssr: false renders nothing under jsdom, so the picker
// editors would never mount. Load them through React.lazy instead.
vi.mock('next/dynamic', async () => {
  const { lazy, Suspense } = await import('react');
  return {
    default: (
      loader: () => Promise<{ default: ComponentType<never> }>,
      options?: { loading?: () => React.ReactNode },
    ) => {
      const Lazy = lazy(loader);
      return (props: object) => (
        <Suspense fallback={options?.loading?.() ?? null}>
          <Lazy {...(props as never)} />
        </Suspense>
      );
    },
  };
});

/** Records every value a field saves, so tests assert the saved result. */
function createSaver<T>() {
  const saved: T[] = [];
  return {
    onSave: async (value: T) => {
      saved.push(value);
    },
    saved,
  };
}

describe('InlineField', () => {
  it('shows a never-filled text value as an empty field instead of failing', () => {
    render(
      <InlineField
        editor={{
          ariaLabel: 'Description',
          kind: 'text',
          onSave: () => undefined,
          placeholder: '-',
          value: null,
        }}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Description' }),
    ).toBeInTheDocument();
  });

  it('saves edited text on Enter', async () => {
    const { onSave, saved } = createSaver<string>();
    render(
      <InlineField
        editor={{ ariaLabel: 'Label', kind: 'text', onSave, value: 'Old' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Label' }));
    const input = screen.getByRole('textbox', { name: 'Label' });
    fireEvent.change(input, { target: { value: 'New' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(saved).toEqual(['New']);
    });
  });

  it('does not save text that was left unchanged or cleared when required', () => {
    const { onSave, saved } = createSaver<string>();
    render(
      <InlineField
        editor={{
          ariaLabel: 'Label',
          isRequired: true,
          kind: 'text',
          onSave,
          value: 'Same',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Label' }));
    const input = screen.getByRole('textbox', { name: 'Label' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Label' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Label' }), {
      target: { value: '   ' },
    });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Label' }), {
      key: 'Enter',
    });

    expect(saved).toEqual([]);
  });

  it('saves a number and keeps it at or above the minimum', async () => {
    const { onSave, saved } = createSaver<number>();
    render(
      <InlineField
        editor={{
          ariaLabel: 'Sort order',
          kind: 'number',
          min: 0,
          onSave,
          value: 3,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sort order' }));
    const input = screen.getByRole('textbox', { name: 'Sort order' });
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(saved).toEqual([0]);
    });
  });

  it('refuses a value that is not a number', async () => {
    const { onSave, saved } = createSaver<number>();
    render(
      <InlineField
        editor={{
          ariaLabel: 'Sort order',
          kind: 'number',
          onSave,
          value: 3,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sort order' }));
    const input = screen.getByRole('textbox', { name: 'Sort order' });
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Sort order' }),
      ).toHaveTextContent('3');
    });
    expect(saved).toEqual([]);
  });

  it('saves the toggled state of a switch', async () => {
    const { onSave, saved } = createSaver<boolean>();
    render(
      <InlineField
        editor={{
          ariaLabel: 'Active',
          isChecked: true,
          kind: 'switch',
          onSave,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Active' }));

    await waitFor(() => {
      expect(saved).toEqual([false]);
    });
  });

  it('saves a picked color when the field loses focus, and ignores an unchanged one', async () => {
    const { onSave, saved } = createSaver<string>();
    render(
      <InlineField
        editor={{
          ariaLabel: 'Color',
          kind: 'color',
          onSave,
          value: '#ff0000',
        }}
      />,
    );

    // The color editor loads on first use.
    const input = await screen.findByLabelText('Color');
    fireEvent.blur(input);
    expect(saved).toEqual([]);

    fireEvent.change(input, { target: { value: '#00ff00' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(saved).toEqual(['#00ff00']);
    });
  });
});
