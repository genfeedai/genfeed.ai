import type { Article } from '@genfeedai/models/content/article.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArticleAccessCard from './article-access-card';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function renderCard(article: Partial<Article>) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <ArticleAccessCard
      article={{ id: 'article-1', ...article } as Article}
      isSaving={false}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe('ArticleAccessCard', () => {
  it('makes a public article paid with an unlock price', async () => {
    const onSave = renderCard({ accessLevel: 'public' });
    expect(
      screen.getByText('Everyone can read the full article.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Paid article' }));
    fireEvent.change(screen.getByLabelText('One-time unlock price (credits)'), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        accessLevel: 'paid',
        unlockPriceCredits: 25,
      }),
    );
  });

  it('keeps a paid article for subscribers only when the price is empty', async () => {
    const onSave = renderCard({ accessLevel: 'paid', unlockPriceCredits: 25 });

    fireEvent.change(screen.getByLabelText('One-time unlock price (credits)'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        accessLevel: 'paid',
        unlockPriceCredits: null,
      }),
    );
  });

  it('refuses a price out of range', () => {
    renderCard({ accessLevel: 'paid', unlockPriceCredits: null });

    fireEvent.change(screen.getByLabelText('One-time unlock price (credits)'), {
      target: { value: '0' },
    });

    expect(
      screen.getByText(
        'Enter a whole number of credits in range, or leave it empty.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
