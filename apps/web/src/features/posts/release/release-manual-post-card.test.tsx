import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ReleaseManualPostCard from './release-manual-post-card';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function renderCard(
  overrides: Partial<Parameters<typeof ReleaseManualPostCard>[0]> = {},
) {
  const handlers = { onComplete: vi.fn(), onSkip: vi.fn() };
  render(
    <ReleaseManualPostCard
      caption="Shipped it."
      isPending={false}
      quotedPostId="1856322244019101979"
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('ReleaseManualPostCard', () => {
  it('opens X with the text and the quoted post filled in', () => {
    renderCard();

    expect(screen.getByText('Needs your post')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in X' })).toHaveAttribute(
      'href',
      'https://x.com/intent/post?text=Shipped+it.&url=https%3A%2F%2Fx.com%2Fi%2Fstatus%2F1856322244019101979',
    );
  });

  it('skips the post', async () => {
    const { onSkip } = renderCard();

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('closes the post as posted without a link', async () => {
    const { onComplete } = renderCard();

    await userEvent.click(
      screen.getByRole('button', { name: 'Mark as posted' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm posted' }),
    );

    expect(onComplete).toHaveBeenCalledWith('');
  });

  it('closes the post as posted with the link they paste', async () => {
    const { onComplete } = renderCard();

    await userEvent.click(
      screen.getByRole('button', { name: 'Mark as posted' }),
    );
    await userEvent.type(
      screen.getByLabelText('Link to your post'),
      'https://x.com/VincentShipsIt/status/1860000000000000001',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirm posted' }),
    );

    expect(onComplete).toHaveBeenCalledWith(
      'https://x.com/VincentShipsIt/status/1860000000000000001',
    );
  });

  it('refuses a link that is not an X post and lets them go back', async () => {
    const { onComplete } = renderCard();

    await userEvent.click(
      screen.getByRole('button', { name: 'Mark as posted' }),
    );
    await userEvent.type(
      screen.getByLabelText('Link to your post'),
      'tomorrow',
    );

    expect(
      screen.getByText('Paste a link to an X post, or leave it empty.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirm posted' }),
    ).toBeDisabled();
    expect(onComplete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(
      screen.getByRole('button', { name: 'Mark as posted' }),
    ).toBeInTheDocument();
  });
});
