import '@agent-tests/media-preview-mocks';
import { GenerationActionCanvas } from '@genfeedai/agent/components/GenerationActionCanvas';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: { messages: [] }) => unknown) =>
    selector({ messages: [] }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/default/default${path}` }),
}));

describe('GenerationActionCanvas', () => {
  it('opens a shared preview independently of reference selection', () => {
    const onToggleReference = vi.fn();
    const { container } = render(
      <GenerationActionCanvas
        generationType="video"
        currentResult={{ id: 'video-1', url: 'https://cdn.test/video.mp4' }}
        referenceIds={[]}
        onToggleReference={onToggleReference}
        selectionLabel="Reference"
      />,
    );
    fireEvent.click(screen.getByTestId('masonry-video'));
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-url',
      'https://cdn.test/video.mp4',
    );
    expect(onToggleReference).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    fireEvent.click(screen.getByText('Reference'));
    expect(onToggleReference).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'video-1' }),
    );
    expect(container.querySelector('button button')).toBeNull();
  });

  it('keeps reference selection disabled while generation is busy', () => {
    render(
      <GenerationActionCanvas
        generationType="image"
        currentResult={{ id: 'image-1', url: 'https://cdn.test/image.png' }}
        referenceIds={[]}
        onToggleReference={vi.fn()}
        selectionLabel="Reference"
        isDisabled
      />,
    );
    expect(screen.getByText('Reference').closest('button')).toBeDisabled();
  });
});
