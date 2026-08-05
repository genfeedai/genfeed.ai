import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';

describe('AgentMediaArtifactPreview', () => {
  it('opens an image collection and navigates between generated variants', () => {
    render(
      <AgentMediaArtifactPreview
        assets={[
          {
            kind: 'image',
            title: 'Image 1',
            url: 'https://cdn.test/image-1.png',
          },
          {
            kind: 'image',
            title: 'Image 2',
            url: 'https://cdn.test/image-2.png',
          },
        ]}
        title="Campaign images"
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Open Image 2 preview' }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Image preview · 2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Image 2' })).toHaveAttribute(
      'src',
      'https://cdn.test/image-2.png',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Previous generated asset' }),
    );
    expect(screen.getByText('Image preview · 1 of 2')).toBeInTheDocument();
  });

  it('opens generated video in the expanded viewer', () => {
    render(
      <AgentMediaArtifactPreview
        assets={[
          {
            kind: 'video',
            title: 'Launch video',
            url: 'https://cdn.test/video.mp4',
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Expand Launch video preview',
      }),
    );

    expect(
      screen.getByLabelText('Launch video expanded preview'),
    ).toHaveAttribute('src', 'https://cdn.test/video.mp4');
  });

  it('opens generated audio in the expanded viewer', () => {
    render(
      <AgentMediaArtifactPreview
        assets={[
          {
            kind: 'audio',
            title: 'Voiceover',
            url: 'https://cdn.test/voice.mp3',
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand Voiceover preview' }),
    );

    expect(screen.getByLabelText('Voiceover expanded preview')).toHaveAttribute(
      'src',
      'https://cdn.test/voice.mp3',
    );
  });
});
