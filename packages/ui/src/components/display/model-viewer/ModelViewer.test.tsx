import { render, screen, waitFor } from '@testing-library/react';
import ModelViewer from '@ui/display/model-viewer/ModelViewer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@google/model-viewer', () => ({}));

function renderViewer(src = 'https://cdn.test/chair.glb') {
  return render(
    <ModelViewer
      alt="Oak chair"
      errorLabel="This 3D model could not be loaded."
      poster="https://cdn.test/chair.jpg"
      src={src}
    />,
  );
}

describe('ModelViewer', () => {
  it('mounts an orbitable, AR-capable viewer for the GLB', async () => {
    const { container } = renderViewer();

    await waitFor(() =>
      expect(container.querySelector('model-viewer')).not.toBeNull(),
    );
    const viewer = container.querySelector('model-viewer');
    expect(viewer).toHaveAttribute('src', 'https://cdn.test/chair.glb');
    expect(viewer).toHaveAttribute('alt', 'Oak chair');
    expect(viewer).toHaveAttribute('poster', 'https://cdn.test/chair.jpg');
    expect(viewer).toHaveAttribute('camera-controls');
    expect(viewer).toHaveAttribute('ar');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error label when the viewer reports a load failure', async () => {
    const { container } = renderViewer();

    await waitFor(() =>
      expect(container.querySelector('model-viewer')).not.toBeNull(),
    );
    container
      .querySelector('model-viewer')
      ?.dispatchEvent(new Event('error'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This 3D model could not be loaded.',
    );
  });

  it('replaces the viewer when the model changes and removes it on unmount', async () => {
    const { container, rerender, unmount } = renderViewer();
    await waitFor(() =>
      expect(container.querySelector('model-viewer')).not.toBeNull(),
    );

    rerender(
      <ModelViewer
        alt="Oak chair"
        errorLabel="This 3D model could not be loaded."
        src="https://cdn.test/table.glb"
      />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll('model-viewer')).toHaveLength(1),
    );
    expect(container.querySelector('model-viewer')).toHaveAttribute(
      'src',
      'https://cdn.test/table.glb',
    );

    unmount();
    expect(document.querySelector('model-viewer')).toBeNull();
  });
});
