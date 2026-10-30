import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebMcpProvider from './WebMcpProvider';

describe('WebMcpProvider', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'modelContext');
    Reflect.deleteProperty(document, 'modelContext');
  });

  it('registers read-only navigation with the legacy preview API', async () => {
    const provideContext = vi.fn();
    Object.defineProperty(navigator, 'modelContext', {
      configurable: true,
      value: { provideContext },
    });

    render(<WebMcpProvider />);

    await waitFor(() => expect(provideContext).toHaveBeenCalledOnce());
    expect(provideContext.mock.calls[0]?.[0]).toMatchObject({
      tools: [
        {
          annotations: { readOnlyHint: true },
          name: 'navigate_genfeed',
        },
      ],
    });
  });

  it('registers the same tool with the current document API', async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: { registerTool },
    });

    render(<WebMcpProvider />);

    await waitFor(() => expect(registerTool).toHaveBeenCalledOnce());
    expect(registerTool.mock.calls[0]?.[0]).toMatchObject({
      annotations: { readOnlyHint: true },
      name: 'navigate_genfeed',
    });
  });
});
