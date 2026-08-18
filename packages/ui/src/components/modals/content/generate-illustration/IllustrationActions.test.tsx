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
        prompt="a pomeranian"
        onClose={vi.fn()}
        onConfirmImage={vi.fn()}
        onGenerate={vi.fn()}
        onTryAgain={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: /agent/i })).toHaveAttribute(
      'href',
      '/demo/FUDNEWS/agent/new',
    );
  });
});
