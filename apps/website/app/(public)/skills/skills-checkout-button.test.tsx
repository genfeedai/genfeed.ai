import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SkillsCheckoutButton, {
  SkillsCheckoutProvider,
} from './skills-checkout-button';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai/v1' },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderTwoButtons() {
  render(
    <SkillsCheckoutProvider>
      <SkillsCheckoutButton>Buy Bundle</SkillsCheckoutButton>
      <SkillsCheckoutButton>Get Pro Skills</SkillsCheckoutButton>
    </SkillsCheckoutProvider>,
  );

  return {
    bundle: screen.getByRole('button', { name: 'Buy Bundle' }),
    pro: screen.getByRole('button', { name: 'Get Pro Skills' }),
  };
}

describe('SkillsCheckoutButton', () => {
  it('starts a checkout session with return URLs for this site', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ url: '' }),
      ok: true,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { bundle } = renderTwoButtons();
    fireEvent.click(bundle);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.genfeed.ai/v1/skills-pro/checkout');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      cancelUrl: `${window.location.origin}/skills`,
      successUrl: `${window.location.origin}/skills/success?session_id={CHECKOUT_SESSION_ID}`,
    });
  });

  it('locks every buy button while one checkout is pending', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    const { bundle, pro } = renderTwoButtons();
    fireEvent.click(bundle);

    await waitFor(() => expect(pro).toBeDisabled());
    expect(bundle).toBeDisabled();
    fireEvent.click(pro);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recovers when the request fails', async () => {
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

    const { bundle, pro } = renderTwoButtons();
    fireEvent.click(bundle);

    await waitFor(() => expect(bundle).toBeDisabled());
    rejectRequest(new Error('network'));

    await waitFor(() => expect(bundle).not.toBeDisabled());
    expect(pro).not.toBeDisabled();
    expect(bundle).toHaveTextContent('Buy Bundle');
  });

  it('recovers when the session comes back without a URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ url: '' }), ok: true }),
    );

    const { bundle } = renderTwoButtons();
    fireEvent.click(bundle);

    await waitFor(() => expect(bundle).not.toBeDisabled());
    expect(bundle).toHaveTextContent('Buy Bundle');
  });
});
