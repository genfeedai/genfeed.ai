import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useWorkspaceSurfaceAdapter,
  type WorkspaceSurfaceAdapter,
  WorkspaceSurfaceAdapterProvider,
} from './WorkspaceSurfaceAdapterContext';

const messagesAdapter: WorkspaceSurfaceAdapter = {
  contextLabel: 'Canvas · Messages',
  inspector: <div>Messages inspector</div>,
  surfaceKey: 'messages',
};

function AdapterRegistration({
  adapter,
}: {
  readonly adapter: WorkspaceSurfaceAdapter;
}) {
  useWorkspaceSurfaceAdapter(adapter);
  return null;
}

describe('WorkspaceSurfaceAdapterProvider', () => {
  it('registers only the adapter owned by the active surface', async () => {
    const onAdapterChange = vi.fn();
    const { unmount } = render(
      <WorkspaceSurfaceAdapterProvider
        activeSurfaceKey="messages"
        onAdapterChange={onAdapterChange}
      >
        <AdapterRegistration adapter={messagesAdapter} />
      </WorkspaceSurfaceAdapterProvider>,
    );

    await waitFor(() =>
      expect(onAdapterChange).toHaveBeenCalledWith(messagesAdapter),
    );
    unmount();
    expect(onAdapterChange).toHaveBeenLastCalledWith(null);
  });

  it('ignores an adapter from a different surface', () => {
    const onAdapterChange = vi.fn();
    render(
      <WorkspaceSurfaceAdapterProvider
        activeSurfaceKey="posts"
        onAdapterChange={onAdapterChange}
      >
        <AdapterRegistration adapter={messagesAdapter} />
      </WorkspaceSurfaceAdapterProvider>,
    );

    expect(onAdapterChange).not.toHaveBeenCalled();
  });
});
