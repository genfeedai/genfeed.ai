import { IngredientFormat } from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ModalVideo from '@/components/modals/ingredients/video/ModalVideo';

// Mock dependencies
vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({ src }: { src?: string }) => (
    <div data-testid="video-player">{src}</div>
  ),
}));

const availableVideos: IVideo[] = [
  {
    id: 'video-1',
    ingredientUrl: 'https://example.com/video.mp4',
    metadataLabel: 'Test Video',
  } as IVideo,
];

/** Owns the open state and the picked video the way a real caller would. */
function ModalVideoHarness({ isOpen = true }: { isOpen?: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(isOpen);
  const [pickedId, setPickedId] = useState<string | null>(null);

  return (
    <>
      <output aria-label="Picked video">{pickedId ?? 'none'}</output>
      <ModalVideo
        availableVideos={availableVideos}
        format={IngredientFormat.PORTRAIT}
        isLoadingVideos={false}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelect={(video) => setPickedId(video.id)}
        selectedFrameIndex={null}
      />
    </>
  );
}

describe('ModalVideo', () => {
  it('is a labelled dialog that closes on Escape', () => {
    render(<ModalVideoHarness />);

    const dialog = screen.getByRole('dialog', { name: 'Select a Video' });
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes from the close button', () => {
    render(<ModalVideoHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('picks a video from the grid', () => {
    render(<ModalVideoHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Test Video/ }));

    expect(screen.getByLabelText('Picked video')).toHaveTextContent('video-1');
  });

  it('renders the video preview when open', () => {
    render(<ModalVideoHarness />);
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ModalVideoHarness isOpen={false} />);
    expect(screen.queryByTestId('video-player')).not.toBeInTheDocument();
  });
});
