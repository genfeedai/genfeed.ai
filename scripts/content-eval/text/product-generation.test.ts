import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFixture } from '../fixtures';
import {
  buildTextGenerationRequest,
  createStubTextGeneration,
  PRODUCT_TEXT_RESERVED_CREDITS,
  PRODUCT_TEXT_ROUTES,
  ProductApiTextGeneration,
  routeRowProblem,
  type TextGenerationRequest,
  threadSizeOf,
} from './product-generation';

const SMOKE_FIXTURE = fileURLToPath(
  new URL(
    '../../../apps/server/api/test/fixtures/content-evals/smoke/text.synthetic.jsonl',
    import.meta.url,
  ),
);
const SMOKE_ROWS = parseFixture(
  readFileSync(SMOKE_FIXTURE, 'utf8'),
  'smoke/text.synthetic.jsonl',
);

const DRAFT: TextGenerationRequest = {
  brandId: 'brand-kelder',
  comment: null,
  prompt: 'Write a post announcing the skillet.',
  requestKey: '11111111-1111-4111-8111-111111111111',
  route: { kind: 'draft', platform: 'twitter' },
  threadSize: null,
};
const THREAD: TextGenerationRequest = {
  ...DRAFT,
  prompt: 'Write a 4-post thread on how to season cast iron.',
  route: { kind: 'thread' },
  threadSize: 4,
};
const REPLY: TextGenerationRequest = {
  ...DRAFT,
  comment: { author: 'mats_cooks', text: 'Does it work on induction?' },
  prompt: 'Reply to a customer asking about induction.',
  route: { kind: 'reply' },
};

interface Recorded {
  body: unknown;
  headers: Record<string, string>;
  method: string;
  url: string;
}

type Answer = { body: unknown; status: number };

/**
 * A product API double. Balances are served in order, one per usage read;
 * each POST path suffix has a fixed answer.
 */
function productApi(options: {
  answers: Record<string, Answer>;
  balances?: Array<number | 'unavailable'>;
}) {
  const calls: Recorded[] = [];
  const balances = [...(options.balances ?? [])];
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
    const answer = Object.entries(options.answers).find(([suffix]) =>
      url.endsWith(suffix),
    )?.[1];
    return answer
      ? Response.json(answer.body, { status: answer.status })
      : new Response('{}', { status: 404 });
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
const DRAFT_PATH = '/posts/draft-generations';

describe('ProductApiTextGeneration: draft route', () => {
  it('posts the brand draft request with the eval key and reports the balance spend', async () => {
    const { calls, port } = productApi({
      answers: {
        [DRAFT_PATH]: {
          body: {
            brandedReceipt: { id: 'receipt-1' },
            description: 'The 26 cm skillet is here. Order today.',
            model: 'google/gemini-3.8-flash',
            postId: 'post-1',
          },
          status: 200,
        },
      },
      balances: [100, 96.5],
    });

    const result = await port.generate(DRAFT, signal);

    expect(result).toMatchObject({
      costEvidence: 'reported',
      creditsCharged: 3.5,
      endpoints: ['posts/draft-generations'],
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
      prompt: DRAFT.prompt,
      requestKey: DRAFT.requestKey,
    });
  });

  it('charges the reservation, never zero, when the balance cannot be read', async () => {
    const { port } = productApi({
      answers: {
        [DRAFT_PATH]: { body: { description: 'A draft.' }, status: 200 },
      },
      balances: ['unavailable', 'unavailable'],
    });

    expect(await port.generate(DRAFT, signal)).toMatchObject({
      costEvidence: 'estimated',
      creditsCharged: PRODUCT_TEXT_RESERVED_CREDITS,
      status: 'generated',
    });
  });

  it('reports an HTTP failure with the server detail', async () => {
    const { port } = productApi({
      answers: {
        [DRAFT_PATH]: { body: { detail: 'Insufficient credits' }, status: 402 },
      },
      balances: [50, 50],
    });

    expect(await port.generate(DRAFT, signal)).toMatchObject({
      creditsCharged: 0,
      error: 'HTTP 402: Insufficient credits',
      status: 'failed',
      text: null,
    });
  });

  it('tells a provider refusal from a failure', async () => {
    const { port } = productApi({
      answers: {
        [DRAFT_PATH]: {
          body: { detail: 'Blocked by content policy' },
          status: 422,
        },
      },
      balances: [50, 49],
    });

    expect((await port.generate(DRAFT, signal)).status).toBe('refused');
  });

  it('treats a 200 with no text as a failed generation, not a pass', async () => {
    const { port } = productApi({
      answers: {
        [DRAFT_PATH]: {
          body: { description: '   ', postId: 'post-2' },
          status: 200,
        },
      },
      balances: [50, 49],
    });

    expect(await port.generate(DRAFT, signal)).toMatchObject({
      creditsCharged: 1,
      error: 'the product returned no generated text',
      status: 'failed',
      text: null,
    });
  });
});

describe('ProductApiTextGeneration: thread route', () => {
  const threadAnswers = (thread: Answer): Record<string, Answer> => ({
    [DRAFT_PATH]: {
      body: {
        description: '1/ Season thin.',
        model: 'google/gemini-3.8-flash',
        postId: 'post-9',
      },
      status: 200,
    },
    '/posts/post-9/thread-drafts': thread,
  });

  it('builds the thread from the branded opener plus the thread-drafts replies, metered across both calls', async () => {
    const { calls, port } = productApi({
      answers: threadAnswers({
        body: { posts: ['2/ Oil it.', '3/ Bake it.', '4/ Cool it.'] },
        status: 200,
      }),
      balances: [100, 95],
    });

    const result = await port.generate(THREAD, signal);

    expect(result).toMatchObject({
      costEvidence: 'reported',
      creditsCharged: 5,
      endpoints: ['posts/draft-generations', 'posts/:id/thread-drafts'],
      error: null,
      postId: 'post-9',
      status: 'generated',
      text: '1/ Season thin.\n\n2/ Oil it.\n\n3/ Bake it.\n\n4/ Cool it.',
    });
    expect(
      calls.find((call) => call.url.endsWith('/thread-drafts'))?.body,
    ).toEqual({ count: 4 });
    // The opener is an X draft, whatever the thread prompt says.
    expect(
      calls.find((call) => call.url.endsWith(DRAFT_PATH))?.body,
    ).toMatchObject({ platform: 'twitter' });
  });

  it('fails the row, but keeps the opener cost, when the replies cannot be drafted', async () => {
    const { port } = productApi({
      answers: threadAnswers({ body: { detail: 'Not a thread' }, status: 400 }),
      balances: [100, 98],
    });

    expect(await port.generate(THREAD, signal)).toMatchObject({
      creditsCharged: 2,
      error: 'thread replies: HTTP 400: Not a thread',
      status: 'failed',
      text: null,
    });
  });

  it('fails the row when thread-drafts returns no replies', async () => {
    const { port } = productApi({
      answers: threadAnswers({ body: { posts: [] }, status: 200 }),
      balances: [100, 98],
    });

    expect(await port.generate(THREAD, signal)).toMatchObject({
      error: 'thread replies: thread-drafts returned no replies',
      status: 'failed',
    });
  });

  it('does not ask for replies when the opener failed', async () => {
    const { calls, port } = productApi({
      answers: { [DRAFT_PATH]: { body: { detail: 'Boom' }, status: 500 } },
      balances: [100, 100],
    });

    const result = await port.generate(THREAD, signal);

    expect(result.status).toBe('failed');
    expect(calls.some((call) => call.url.endsWith('/thread-drafts'))).toBe(
      false,
    );
  });
});

describe('ProductApiTextGeneration: reply route', () => {
  const REPLY_PATH = '/reply-bot-configs/author-reply/draft';

  it('answers the inbound comment and charges the reservation because the route is not metered', async () => {
    const { calls, port } = productApi({
      answers: {
        [REPLY_PATH]: {
          body: {
            draft: 'Yes. It works on induction, gas and open fire.',
            intentLabel: 'Question',
          },
          status: 200,
        },
      },
    });

    const result = await port.generate(REPLY, signal);

    expect(result).toMatchObject({
      costEvidence: 'estimated',
      creditsCharged: PRODUCT_TEXT_RESERVED_CREDITS,
      endpoints: ['reply-bot-configs/author-reply/draft'],
      status: 'generated',
      text: 'Yes. It works on induction, gas and open fire.',
    });
    // No usage reads: a balance diff on an unmetered route would read as free.
    expect(calls.some((call) => call.url.endsWith('/credits/usage'))).toBe(
      false,
    );
    expect(calls[0]?.body).toMatchObject({
      brandId: 'brand-kelder',
      commentAuthor: 'mats_cooks',
      commentText: 'Does it work on induction?',
      platform: 'twitter',
    });
  });

  it('fails the row when the product skips the comment instead of answering', async () => {
    const { port } = productApi({
      answers: {
        [REPLY_PATH]: {
          body: { draft: '', intentLabel: 'Troll' },
          status: 200,
        },
      },
    });

    expect(await port.generate(REPLY, signal)).toMatchObject({
      error: 'the product skipped this comment as Troll',
      status: 'failed',
      text: null,
    });
  });

  it('refuses a reply request that carries no comment', async () => {
    const { calls, port } = productApi({ answers: {} });

    expect(
      await port.generate({ ...REPLY, comment: null }, signal),
    ).toMatchObject({
      error: 'a reply needs the inbound comment',
      status: 'failed',
    });
    expect(calls).toHaveLength(0);
  });
});

describe('ProductApiTextGeneration: article route', () => {
  const ARTICLE_PATH = '/articles/generations';
  const ARTICLE: TextGenerationRequest = {
    ...DRAFT,
    prompt: 'Write a short article: how to choose your first skillet.',
    route: { kind: 'article', category: null },
  };
  const articleAnswer: Answer = {
    body: {
      data: [
        {
          attributes: {
            content: 'Pick 26 cm if you cook for two.',
            label: 'Choosing your first skillet',
          },
        },
      ],
    },
    status: 200,
  };

  it('generates one article for the brand and reports the balance spend', async () => {
    const { calls, port } = productApi({
      answers: { [ARTICLE_PATH]: articleAnswer },
      balances: [100, 94],
    });

    const result = await port.generate(ARTICLE, signal);

    expect(result).toMatchObject({
      costEvidence: 'reported',
      creditsCharged: 6,
      endpoints: ['articles/generations'],
      status: 'generated',
      text: 'Choosing your first skillet\n\nPick 26 cm if you cook for two.',
    });
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      brandId: 'brand-kelder',
      count: 1,
      prompt: ARTICLE.prompt,
    });
  });

  it('asks for the LinkedIn category on a LinkedIn article', async () => {
    const { calls, port } = productApi({
      answers: { [ARTICLE_PATH]: articleAnswer },
      balances: [100, 94],
    });

    await port.generate(
      { ...ARTICLE, route: { kind: 'article', category: 'linkedin-article' } },
      signal,
    );

    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      category: 'linkedin-article',
    });
  });

  it('fails the row when article generation is not enabled for the org', async () => {
    const { port } = productApi({
      answers: {
        [ARTICLE_PATH]: {
          body: {
            detail: 'Article generation is not enabled for this organization',
          },
          status: 403,
        },
      },
      balances: [100, 100],
    });

    expect(await port.generate(ARTICLE, signal)).toMatchObject({
      error:
        'HTTP 403: Article generation is not enabled for this organization',
      status: 'failed',
      text: null,
    });
  });

  it('fails the row when the generated article has no content', async () => {
    const { port } = productApi({
      answers: {
        [ARTICLE_PATH]: { body: { data: [{ attributes: {} }] }, status: 200 },
      },
      balances: [100, 99],
    });

    expect(await port.generate(ARTICLE, signal)).toMatchObject({
      error: 'the product returned no article content',
      status: 'failed',
    });
  });
});

describe('ProductApiTextGeneration: newsletter route', () => {
  const NEWSLETTER_PATH = '/newsletters/generate-draft';
  const NEWSLETTER: TextGenerationRequest = {
    ...DRAFT,
    prompt: 'Write the monthly KELDER newsletter: a seasonal recipe.',
    route: { kind: 'newsletter' },
  };

  it('drafts a newsletter from the topic and charges the reservation because the route is not metered', async () => {
    const { calls, port } = productApi({
      answers: {
        [NEWSLETTER_PATH]: {
          body: {
            data: {
              attributes: {
                content: 'This month: a cast-iron cornbread.',
                label: 'KELDER in October',
              },
            },
          },
          status: 200,
        },
      },
    });

    const result = await port.generate(NEWSLETTER, signal);

    expect(result).toMatchObject({
      costEvidence: 'estimated',
      creditsCharged: PRODUCT_TEXT_RESERVED_CREDITS,
      endpoints: ['newsletters/generate-draft'],
      status: 'generated',
      text: 'KELDER in October\n\nThis month: a cast-iron cornbread.',
    });
    expect(calls.some((call) => call.url.endsWith('/credits/usage'))).toBe(
      false,
    );
    // The route takes no brand id: it writes for the key's default brand.
    expect(calls[0]?.body).toEqual({ topic: NEWSLETTER.prompt });
  });

  it('keeps a retryable 503 (brand context unavailable) as a failed row', async () => {
    const { port } = productApi({
      answers: {
        [NEWSLETTER_PATH]: {
          body: { detail: 'Brand context is unavailable for this draft.' },
          status: 503,
        },
      },
    });

    expect(await port.generate(NEWSLETTER, signal)).toMatchObject({
      creditsCharged: PRODUCT_TEXT_RESERVED_CREDITS,
      error: 'HTTP 503: Brand context is unavailable for this draft.',
      status: 'failed',
    });
  });
});

describe('product text routes', () => {
  it('serves posts, threads, replies, articles and newsletters', () => {
    expect(PRODUCT_TEXT_ROUTES).toEqual({
      article: { kind: 'article', category: null },
      'linkedin-article': { kind: 'article', category: 'linkedin-article' },
      'linkedin-post': { kind: 'draft', platform: 'linkedin' },
      newsletter: { kind: 'newsletter' },
      reply: { kind: 'reply' },
      'social-post': { kind: 'draft', platform: 'twitter' },
      thread: { kind: 'thread' },
    });
  });

  it('runs every smoke fixture row of a routed kind through its route', () => {
    const routed = SMOKE_ROWS.filter(
      (row) => PRODUCT_TEXT_ROUTES[row.contentKind] !== undefined,
    );

    expect(routed).toHaveLength(14);
    for (const row of routed) {
      expect(routeRowProblem(row)).toBeNull();
    }
  });

  it('asks the thread route for the size the row asks for', () => {
    const sizes = SMOKE_ROWS.filter((row) => row.contentKind === 'thread').map(
      (row) => threadSizeOf(row.input.prompt),
    );

    expect(sizes).toEqual([4, 3]);
    expect(threadSizeOf('Write a thread')).toBe(3);
    expect(threadSizeOf('Write a 12-post thread')).toBe(5);
    expect(threadSizeOf('Write a 1-post thread')).toBe(2);
  });

  it('builds a reply request from the row comment and rejects a reply row without one', () => {
    const reply = SMOKE_ROWS.find((row) => row.contentKind === 'reply');
    if (!reply) throw new Error('smoke fixture has no reply row');

    expect(buildTextGenerationRequest(reply, 'brand-1', 'key-1')).toMatchObject(
      {
        comment: reply.input.comment,
        route: { kind: 'reply' },
        threadSize: null,
      },
    );
    const withoutComment = {
      ...reply,
      input: { ...reply.input, comment: undefined },
    };
    expect(routeRowProblem(withoutComment)).toMatch(/needs input.comment/);
    expect(() =>
      buildTextGenerationRequest(withoutComment, 'brand-1', 'key-1'),
    ).toThrow(/needs input.comment/);
  });

  it('rejects a row whose platform the route does not write for', () => {
    const post = SMOKE_ROWS.find((row) => row.contentKind === 'social-post');
    if (!post) throw new Error('smoke fixture has no social-post row');

    expect(
      routeRowProblem({
        ...post,
        input: { ...post.input, platform: 'linkedin' },
      }),
    ).toMatch(/writes for twitter/);
  });

  it('rejects a prompt the article or newsletter route would refuse', () => {
    const newsletter = SMOKE_ROWS.find(
      (row) => row.contentKind === 'newsletter',
    );
    if (!newsletter) throw new Error('smoke fixture has no newsletter row');

    expect(
      routeRowProblem({
        ...newsletter,
        input: { ...newsletter.input, prompt: 'x'.repeat(201) },
      }),
    ).toMatch(/takes at most 200/);
  });

  it('leaves script and ad copy without a route', () => {
    for (const kind of ['ad-copy', 'script']) {
      const row = SMOKE_ROWS.find(
        (candidate) => candidate.contentKind === kind,
      );
      if (!row) throw new Error(`smoke fixture has no ${kind} row`);
      expect(routeRowProblem(row)).toBe(`${kind} has no product text route`);
    }
  });

  it('gives the stub port a deterministic draft per route and a model to attribute', async () => {
    const port = createStubTextGeneration('google/gemini-3.8-flash');
    const first = await port.generate(DRAFT, signal);

    expect(first).toEqual(await port.generate(DRAFT, signal));
    expect(first).toMatchObject({ model: 'google/gemini-3.8-flash' });
    expect(first.text).toContain(DRAFT.prompt);
    expect(
      (await port.generate(THREAD, signal)).text?.split('\n\n'),
    ).toHaveLength(4);
    expect((await port.generate(REPLY, signal)).text).toContain('mats_cooks');
  });
});
