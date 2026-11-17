import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandVideoRevisionDiff from './BrandVideoRevisionDiff';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const t = translateFromCatalog('pages.brandVideoKit');
  return { useTranslations: () => t };
});

const finishing = {
  endCard: { durationSeconds: 3, isEnabled: false },
  lut: { isEnabled: false },
  watermark: { opacity: 0.35, position: 'bottom-right' as const },
};

function draft(patch: Partial<IBrandKitDraft>): IBrandKitDraft {
  return { fields: {}, ...patch } as IBrandKitDraft;
}

describe('BrandVideoRevisionDiff', () => {
  it('renders nothing when the draft changes nothing', () => {
    const { container } = render(
      <BrandVideoRevisionDiff
        approved={draft({ finishing })}
        draft={draft({ finishing })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each change under its group with the before and after values', () => {
    render(
      <BrandVideoRevisionDiff
        approved={draft({ finishing })}
        draft={draft({
          finishing: {
            ...finishing,
            endCard: { durationSeconds: 4, isEnabled: true },
          },
        })}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Finishing' }),
    ).toBeInTheDocument();
    expect(screen.getByText('End card length (s)')).toBeInTheDocument();
    expect(screen.getByText(/Off →/)).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Video identity' }),
    ).toBeNull();
  });

  it('shows a changed finishing value against a revision that predates finishing', () => {
    render(
      <BrandVideoRevisionDiff
        approved={draft({})}
        draft={draft({
          finishing: {
            ...finishing,
            endCard: { durationSeconds: 6, isEnabled: false },
          },
        })}
        finishingBaseline={finishing}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Finishing' }),
    ).toBeInTheDocument();
    expect(screen.getByText('End card length (s)')).toBeInTheDocument();
    expect(screen.queryByText('End card')).toBeNull();
  });
});
