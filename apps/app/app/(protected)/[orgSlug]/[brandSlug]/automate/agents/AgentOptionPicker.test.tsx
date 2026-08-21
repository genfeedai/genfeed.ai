// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentOptionPicker from './AgentOptionPicker';

const options = [
  {
    description: 'Writes scripts and launch copy.',
    label: 'Script Writer',
    meta: '120 credits / day',
    value: 'script-writer',
  },
  {
    description: 'Creates short-form video.',
    label: 'Video Creator',
    meta: '180 credits / day',
    value: 'video-creator',
  },
];

describe('AgentOptionPicker', () => {
  beforeEach(() => {
    class MockResizeObserver {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }

    globalThis.ResizeObserver =
      MockResizeObserver as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows one selected summary and selects a rich dropdown option', async () => {
    const onValueChange = vi.fn();

    render(
      <AgentOptionPicker
        label="Choose an agent template"
        onValueChange={onValueChange}
        options={options}
        value="script-writer"
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Choose an agent template: Script Writer',
      }),
    );
    fireEvent.click(
      await screen.findByRole('option', { name: /Video Creator/i }),
    );
    expect(onValueChange).toHaveBeenCalledWith('video-creator');
  });

  it('focuses search and starts keyboard navigation on the selected option', async () => {
    const onValueChange = vi.fn();

    const { rerender } = render(
      <AgentOptionPicker
        label="Choose an agent template"
        onValueChange={onValueChange}
        options={options}
        value="video-creator"
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Choose an agent template: Video Creator',
      }),
    );

    // cmdk's Command.Input exposes role="combobox" and is labelled via the
    // Command `label` (hidden <label>) plus the input aria-label.
    const search = await screen.findByRole('combobox', {
      name: 'Choose an agent template',
    });
    await waitFor(() => expect(search).toHaveFocus());
    expect(
      screen.getByRole('option', { name: /Video Creator/i }),
    ).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith('script-writer');

    rerender(
      <AgentOptionPicker
        label="Choose an agent template"
        onValueChange={onValueChange}
        options={options}
        value="script-writer"
      />,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Choose an agent template: Script Writer',
      }),
    );
    expect(
      await screen.findByRole('option', { name: /Script Writer/i }),
    ).toHaveAttribute('aria-selected', 'true');
  });
});
