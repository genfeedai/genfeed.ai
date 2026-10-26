import { describe, expect, it } from 'vitest';
import {
  createStubTextGeneration,
  PRODUCT_TEXT_RESERVED_CREDITS,
  PRODUCT_TEXT_ROUTES,
  ProductApiTextGeneration,
  type TextGenerationRequest,
} from './product-generation';

const REQUEST: TextGenerationRequest = {
  brandId: 'brand-kelder',
  platform: 'twitter',
  prompt: 'Write a post announcing the skillet.',
  requestKey: '11111111-1111-4111-8111-111111111111',
};

interface Recorded {
  body: unknown;
  headers: Record<string, string>;
  method: string;
  url: string;
}

/** A product API double: balances are served in order, one per usage read. */
function productApi(options: {
  balances: Array<number | 'unavailable'>;
  draft: { body: unknown; status: number };
}) {
  const calls: Recorded[] = [];
  const balances = [...options.balances];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: init?.headers as Record<string, string>,
      method: init?.method ?? 'GET',
      url,
    });
    if (url.endsWith('/credits/usage')) {
      const balance = balances.shift();
      return balance === undefined || balance === 'unavailable'
        ? new Response('{}', { status: 503 })
        : Response.json({ data: { attributes: { currentBalance: balance } } });
    }
    return Response.json(options.draft.body, { status: options.draft.status });
  };
  return {
    calls,
    port: new ProductApiTextGeneration({
      apiKey: 'eval-key',
      apiUrl: 'https://api.example.test/',
      fetchImpl,
    }),
  };
}

const signal = new AbortController().signal;

describe('ProductApiTextGeneration', () => {
  it('posts the brand draft request with the eval key and reports the balance spend', async () => {
    const { calls, port } = productApi({
      balances: [100, 96.5],
      draft: {
        body: {
          brandedReceipt: { id: 'receipt-1' },
          description: 'The 26 cm skillet is here. Order today.',
          model: 'google/gemini-3.8-flash',
          postId: 'post-1',
        },
        status: 200,
      },
    });

    const result = await port.generate(REQUEST, signal);

    expect(result).toMatchObject({
      costEvidence: 'reported',
      creditsCharged: 3.5,
      error: null,
      model: 'google/gemini-3.8-flash',
      postId: 'post-1',
      status: 'generated',
      text: 'The 26 cm skillet is here. Order today.',
    });
    const draft = calls.find((call) => call.method === 'POST');
    expect(draft?.url).toBe('https://api.example.test/posts/draft-generations');
    expect(draft?.headers.Authorization).toBe('Bearer eval-key');
    expect(draft?.body).toEqual({
      brandId: 'brand-kelder',
      platform: 'twitter',
      prompt: REQUEST.prompt,
      requestKey: REQUEST.requestKey,
    });
  });

  it('charges the reservation, never zero, when the balance cannot be read', async () => {
    const { port } = productApi({
      balances: ['unavailable', 'unavailable'],
      draft: { body: { description: 'A draft.' }, status: 200 },
    });

    const result = await port.generate(REQUEST, signal);

    expect(result).toMatchObject({
      costEvidence: 'estimated',
      creditsCharged: PRODUCT_TEXT_RESERVED_CREDITS,
      status: 'generated',
    });
  });

  it('reports an HTTP failure with the server detail and still carries the charge', async () => {
    const { port } = productApi({
      balances: [50, 50],
      draft: { body: { detail: 'Insufficient credits' }, status: 402 },
    });

    const result = await port.generate(REQUEST, signal);

    expect(result).toMatchObject({
      creditsCharged: 0,
      error: 'HTTP 402: Insufficient credits',
      status: 'failed',
      text: null,
    });
  });

  it('tells a provider refusal from a failure', async () => {
    const { port } = productApi({
      balances: [50, 49],
      draft: { body: { detail: 'Blocked by content policy' }, status: 422 },
    });

    expect((await port.generate(REQUEST, signal)).status).toBe('refused');
  });

  it('treats a 200 with no text as a failed generation, not a pass', async () => {
    const { port } = productApi({
      balances: [50, 49],
      draft: { body: { description: '   ', postId: 'post-2' }, status: 200 },
    });

    const result = await port.generate(REQUEST, signal);

    expect(result).toMatchObject({
      creditsCharged: 1,
      error: 'the product returned no generated text',
      status: 'failed',
      text: null,
    });
  });
});

describe('product text routes', () => {
  it('maps the kinds served by the draft route to their platform', () => {
    expect(PRODUCT_TEXT_ROUTES).toEqual({
      'linkedin-post': { platform: 'linkedin' },
      'social-post': { platform: 'twitter' },
    });
  });

  it('gives the stub port a deterministic draft and a model to attribute', async () => {
    const port = createStubTextGeneration('google/gemini-3.8-flash');
    const first = await port.generate(REQUEST, signal);
    const again = await port.generate(REQUEST, signal);

    expect(first).toEqual(again);
    expect(first).toMatchObject({ model: 'google/gemini-3.8-flash' });
    expect(first.text).toContain(REQUEST.prompt);
  });
});
