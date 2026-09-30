import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowCardPreview from './WorkflowCardPreview';

vi.mock('next/image', () => ({
  default: ({
    unoptimized: _unoptimized,
    alt,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
    <img alt={alt} {...props} />
  ),
}));

vi.mock('@ui/display/video-player/VideoPlayer', () => ({
  default: ({
    src,
    ariaLabel,
    mediaProps,
    config,
  }: {
    src: string;
    ariaLabel: string;
    mediaProps: React.VideoHTMLAttributes<HTMLVideoElement>;
    config: { controls: boolean };
  }) => (
    <video
      aria-label={ariaLabel}
      src={src}
      {...mediaProps}
      controls={config.controls}
    >
      <track kind="captions" />
    </video>
  ),
}));

const nodes = [
  {
    id: 'source',
    type: 'genfeedAction',
    data: { label: 'Read Brand', actionId: 'brand.read' },
  },
  { id: 'output', type: 'genfeedAction', data: { label: 'Generate Image' } },
];
const edges = [{ source: 'source', target: 'output' }];

describe('WorkflowCardPreview', () => {
  it('shows the real workflow diagram instead of a generic image', () => {
    render(
      <WorkflowCardPreview name="Daily digest" nodes={nodes} edges={edges} />,
    );
    expect(
      screen.getByRole('img', { name: 'Daily digest workflow diagram' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 steps')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Default workflow card' }),
    ).not.toBeInTheDocument();
  });

  it('falls back to the graph when video fails, then accepts a new cover', () => {
    const { rerender } = render(
      <WorkflowCardPreview
        name="Daily digest"
        thumbnail="https://cdn.example.com/workflow.mp4"
        nodes={nodes}
        edges={edges}
      />,
    );
    const preview = screen.getByLabelText('Daily digest workflow preview');
    expect(preview).not.toHaveAttribute('controls');
    fireEvent.error(preview);
    expect(
      screen.getByRole('img', { name: 'Daily digest workflow diagram' }),
    ).toBeInTheDocument();
    rerender(
      <WorkflowCardPreview
        name="Daily digest"
        thumbnail="https://cdn.example.com/new.jpg"
        nodes={nodes}
        edges={edges}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Daily digest thumbnail' }),
    ).toHaveAttribute('src', 'https://cdn.example.com/new.jpg');
  });

  it('falls back to the graph when an image fails', () => {
    render(
      <WorkflowCardPreview
        name="Daily digest"
        thumbnail="https://cdn.example.com/broken.jpg"
        nodes={nodes}
        edges={edges}
      />,
    );
    fireEvent.error(
      screen.getByRole('img', { name: 'Daily digest thumbnail' }),
    );
    expect(
      screen.getByRole('img', { name: 'Daily digest workflow diagram' }),
    ).toBeInTheDocument();
  });

  it('represents empty workflows honestly', () => {
    render(<WorkflowCardPreview name="Empty workflow" nodes={[]} />);
    expect(screen.getByText('No steps yet')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('distinguishes missing graph data from an empty workflow', () => {
    render(<WorkflowCardPreview name="Older workflow" />);
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No steps yet')).not.toBeInTheDocument();
  });

  it('keeps a supplied thumbnail URL as-is', () => {
    render(
      <WorkflowCardPreview
        name="Daily digest"
        thumbnail="https://cdn.genfeed.ai/assets/workflows/digest.jpg"
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Daily digest thumbnail' }),
    ).toHaveAttribute(
      'src',
      'https://cdn.genfeed.ai/assets/workflows/digest.jpg',
    );
  });
});
