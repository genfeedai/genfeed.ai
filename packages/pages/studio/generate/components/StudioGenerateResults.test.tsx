import { IngredientStatus } from '@genfeedai/enums';
import StudioGenerateResults from '@pages/studio/generate/components/StudioGenerateResults';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@pages/studio/generate/components/StudioGenerateCard', () => ({
  default: ({ job }: { job: { id: string } }) => <div>{job.id}</div>,
}));

vi.mock('@ui/display/masonry/Masonry', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="studio-masonry">{children}</div>
  ),
}));

describe('StudioGenerateResults', () => {
  it('uses the shared masonry gallery for generated assets', () => {
    render(
      <StudioGenerateResults
        isLoading={false}
        jobs={[
          {
            createdAt: 1,
            id: 'asset-1',
            prompt: 'Prompt',
            status: IngredientStatus.GENERATED,
            type: 'image',
          },
        ]}
        onReprompt={vi.fn()}
      />,
    );

    expect(screen.getByTestId('studio-masonry')).toBeInTheDocument();
    expect(screen.getByText('asset-1')).toBeInTheDocument();
  });
});
