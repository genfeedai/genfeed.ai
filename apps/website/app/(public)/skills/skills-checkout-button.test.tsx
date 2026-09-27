import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SkillsCheckoutButton from './skills-checkout-button';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai/v1' },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SkillsCheckoutButton', () => {
  it('starts a checkout session with return URLs for this site', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({}),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SkillsCheckoutButton>Buy Bundle</SkillsCheckoutButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Buy Bundle' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.genfeed.ai/v1/skills-pro/checkout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      cancelUrl: `${window.location.origin}/skills`,
      successUrl: `${window.location.origin}/skills/success?session_id={CHECKOUT_SESSION_ID}`,
    });
  });

  it('disables itself while pending and recovers when checkout fails', async () => {
    let rejectRequest: (reason: Error) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((_resolve, reject) => {
            rejectRequest = reject;
          }),
      ),
    );

    render(<SkillsCheckoutButton>Buy Bundle</SkillsCheckoutButton>);
    const button = screen.getByRole('button', { name: 'Buy Bundle' });
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    rejectRequest(new Error('network'));

    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveTextContent('Buy Bundle');
  });
});
