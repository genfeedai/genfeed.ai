import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileSubscribe from './ProfileSubscribe';

const getSignedInBetterAuthToken = vi.fn();
const subscribe = vi.fn();

vi.mock('@genfeedai/auth-client', () => ({
  getSignedInBetterAuthToken: (...args: unknown[]) =>
    getSignedInBetterAuthToken(...args),
}));
vi.mock('@services/content/newsletter-account.service', () => ({
  NewsletterAccountService: { getInstance: () => ({ subscribe }) },
}));

const assign = vi.fn();

describe('ProfileSubscribe', () => {
  beforeEach(() => {
    getSignedInBetterAuthToken.mockReset();
    subscribe.mockReset();
    assign.mockReset();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign },
    });
  });

  it('is a joined group with a Subscribe button and no email field', () => {
    render(<ProfileSubscribe handle="acme" source="profile" />);

    expect(
      screen.getByRole('group', { name: 'Subscribe to the newsletter' }),
    ).toHaveTextContent('Newsletter');
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('subscribes a signed-in reader with their account in one click', async () => {
    getSignedInBetterAuthToken.mockResolvedValue('token');
    subscribe.mockResolvedValue({ status: 'subscribed' });
    render(<ProfileSubscribe handle="acme" source="post" sourceRef="post-7" />);

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(
      await screen.findByRole('button', { name: 'Subscribed' }),
    ).toBeDisabled();
    expect(subscribe).toHaveBeenCalledWith({
      handle: 'acme',
      source: 'post',
      sourceRef: 'post-7',
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it('asks a reader with an unverified email to confirm it', async () => {
    getSignedInBetterAuthToken.mockResolvedValue('token');
    subscribe.mockResolvedValue({ status: 'confirmation_sent' });
    render(<ProfileSubscribe handle="acme" source="profile" />);

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(
      await screen.findByText(
        'Check your inbox and confirm to finish subscribing.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Confirmation pending' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Subscribed' }),
    ).not.toBeInTheDocument();
  });

  it('explains a signed-out subscribe in a modal before any redirect', async () => {
    getSignedInBetterAuthToken.mockResolvedValue(null);
    render(<ProfileSubscribe handle="acme" source="profile" />);

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    const modal = await screen.findByRole('dialog');
    expect(modal).toHaveTextContent('Subscribe to @acme');
    expect(modal).toHaveTextContent('A Genfeed account');
    expect(modal).toHaveTextContent('we subscribe you to the @acme newsletter');
    expect(assign).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { hidden: true, name: 'Subscribe' }),
    ).toBeEnabled();
  });

  it('closes the modal on Cancel and goes nowhere', async () => {
    getSignedInBetterAuthToken.mockResolvedValue(null);
    render(<ProfileSubscribe handle="acme" source="profile" />);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('sends a signed-out reader through sign-up carrying the creator on Continue', async () => {
    getSignedInBetterAuthToken.mockResolvedValue(null);
    const tracked: CustomEvent[] = [];
    const listen = (event: Event) => tracked.push(event as CustomEvent);
    window.addEventListener('genfeed:marketing:button-click', listen);
    render(<ProfileSubscribe handle="acme" source="post" sourceRef="post-7" />);
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    window.removeEventListener('genfeed:marketing:button-click', listen);
    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(String(assign.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/sign-up');
    expect(url.searchParams.get('follow')).toBe('acme');
    expect(subscribe).not.toHaveBeenCalled();
    expect(tracked.map((event) => event.detail.trackingName)).toEqual([
      'creator_subscribe_click',
      'creator_subscribe_continue_click',
    ]);
    expect(tracked[1]?.detail.trackingData).toMatchObject({
      action: 'profile_subscribe_continue',
      profile: 'acme',
      source: 'post',
    });
  });

  it('says so when the subscription did not go through', async () => {
    getSignedInBetterAuthToken.mockResolvedValue('token');
    subscribe.mockRejectedValue(new Error('network'));
    render(<ProfileSubscribe handle="acme" source="profile" />);

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That did not go through',
    );
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled();
  });

  it('can sit in a row of actions as a single button, without the group', () => {
    render(
      <ProfileSubscribe handle="acme" layout="compact" source="article" />,
    );

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled();
  });
});
