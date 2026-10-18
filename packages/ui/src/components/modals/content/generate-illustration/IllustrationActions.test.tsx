import { render, screen } from '@testing-library/react';
import IllustrationActions from '@ui/modals/content/generate-illustration/IllustrationActions';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/demo/FUDNEWS${path}`,
  }),
}));

describe('IllustrationActions', () => {
  it('scopes the Agent link to the current brand instead of bare /agent/new', () => {
    render(
      <IllustrationActions
        generatedImageId={null}
        generatedImageUrl={null}
        isGenerating={false}
        onClose={vi.fn()}
        onConfirmImage={vi.fn()}
        onTryAgain={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: /agent/i })).toHaveAttribute(
      'href',
      '/demo/FUDNEWS/agent/new',
    );
  });

  it('only offers Cancel before an image exists; generating lives in the prompt composer', () => {
    render(
      <IllustrationActions
        generatedImageId={null}
        generatedImageUrl={null}
        isGenerating={false}
        onClose={vi.fn()}
        onConfirmImage={vi.fn()}
        onTryAgain={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Generate' }),
    ).not.toBeInTheDocument();
  });
});
