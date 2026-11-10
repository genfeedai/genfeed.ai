import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewsletterSubscribeForm from '@web-components/newsletter/NewsletterSubscribeForm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscribeToNewsletter = vi.fn();
const findPublicProfileBySlug = vi.fn();

vi.mock('../../api/load-public-service', () => ({
  loadPublicService: async () => ({
    findPublicProfileBySlug,
    subscribeToNewsletter,
  }),
}));

function typeEmail(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), {
    target: { value },
  });
}

describe('NewsletterSubscribeForm', () => {
  beforeEach(() => {
    subscribeToNewsletter.mockReset().mockResolvedValue(undefined);
    findPublicProfileBySlug.mockReset();
  });

  it('keeps Subscribe disabled until the address looks like an email', () => {
    render(<NewsletterSubscribeForm brandId="brand-1" source="profile" />);

    typeEmail('reader@');
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeDisabled();

    typeEmail('reader@example.com');
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled();
  });

  it('asks the reader to confirm by email after a sign-up', async () => {
    render(
      <NewsletterSubscribeForm
        brandId="brand-1"
        source="article"
        sourceRef="article-9"
      />,
    );

    typeEmail(' reader@example.com ');
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(
      await screen.findByText(
        'Check your inbox and confirm to finish subscribing.',
      ),
    ).toBeInTheDocument();
    expect(subscribeToNewsletter.mock.calls[0]?.[0]).toEqual({
      brandId: 'brand-1',
      email: 'reader@example.com',
      source: 'article',
      sourceRef: 'article-9',
    });
  });

  it('finds the brand from a handle when the page does not know its id', async () => {
    findPublicProfileBySlug.mockResolvedValue({ id: 'genfeed-brand' });
    render(<NewsletterSubscribeForm brandHandle="genfeedai" source="footer" />);

    typeEmail('reader@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    await waitFor(() =>
      expect(subscribeToNewsletter.mock.calls[0]?.[0]).toEqual({
        brandId: 'genfeed-brand',
        email: 'reader@example.com',
        source: 'footer',
      }),
    );
  });

  it('says so when the sign-up fails, and keeps the form', async () => {
    subscribeToNewsletter.mockRejectedValue(new Error('down'));
    render(<NewsletterSubscribeForm brandId="brand-1" source="homepage" />);

    typeEmail('reader@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That did not go through. Try again in a moment.',
    );
    expect(
      screen.getByRole('textbox', { name: 'Email address' }),
    ).toBeInTheDocument();
  });
});
