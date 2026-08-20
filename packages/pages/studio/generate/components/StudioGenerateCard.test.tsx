import { IngredientStatus } from '@genfeedai/enums';
import StudioGenerateCard from '@pages/studio/generate/components/StudioGenerateCard';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/image', () => ({
  default: ({ alt, onError, src }: React.ComponentProps<'img'>) => (
    <img alt={alt} onError={onError} src={String(src)} />
  ),
}));

const generatedJob = {
  createdAt: 1,
  height: 1350,
  id: 'job-1',
  modelKey: 'flux-schnell',
  prompt: 'A boxer in black apparel',
  status: IngredientStatus.GENERATED,
  type: 'image' as const,
  url: 'https://cdn.example.com/image.png',
  width: 1080,
};

describe('StudioGenerateCard', () => {
  it('keeps asset details in the media hover overlay', () => {
    const { container } = render(
      <StudioGenerateCard job={generatedJob} onReprompt={vi.fn()} />,
    );

    expect(screen.getByText(generatedJob.prompt)).toBeInTheDocument();
    expect(screen.getByText(generatedJob.modelKey)).toBeInTheDocument();
    expect(
      screen.getByText(generatedJob.prompt).closest('[data-asset-details]'),
    ).toHaveClass('absolute');
    expect(container.querySelector('[data-asset-footer]')).toBeNull();
  });

  it('replaces a broken image with the shared preview fallback', () => {
    render(<StudioGenerateCard job={generatedJob} onReprompt={vi.fn()} />);

    fireEvent.error(screen.getByRole('img', { name: generatedJob.prompt }));

    expect(
      screen.queryByRole('img', { name: generatedJob.prompt }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('studio-asset-job-1')).toHaveAttribute(
      'data-asset-media-state',
      'fallback',
    );
  });

  it('shows the fallback immediately when a generated asset has no url', () => {
    render(
      <StudioGenerateCard
        job={{ ...generatedJob, url: undefined }}
        onReprompt={vi.fn()}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });
});
