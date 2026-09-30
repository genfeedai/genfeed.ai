import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.test/v1',
    apps: {
      app: 'https://app.genfeed.test',
      website: 'https://genfeed.test',
    },
  },
}));

vi.mock('@ui/buttons/tracked/ButtonTracked', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    description,
    heroVisual,
    title,
  }: {
    children: ReactNode;
    description: ReactNode;
    heroVisual: ReactNode;
    title: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {heroVisual}
      {children}
    </main>
  ),
}));

const { default: BenchmarkContent } = await import('./benchmark-content');
const { getBenchmarkData } = await import('./benchmark-loader');

const SEASON = {
  announcedAt: '2026-09-10T00:00:00.000Z',
  closedAt: null,
  contestantIds: ['genfeed-compiled.model', 'raw.model'],
  id: 's1-image',
  ladder: [],
  matchCount: 0,
  medium: 'image',
  openedAt: null,
  state: 'announced',
  taskIds: ['text-in-image'],
  title: 'Season One — Image',
  updatedAt: '2026-09-10T00:00:00.000Z',
};

const CONTESTANTS = [
  {
    addedAt: '2026-09-10T00:00:00.000Z',
    id: 'genfeed-compiled.model',
    isCompiled: true,
    label: 'Genfeed compile → Model',
    mediums: ['image'],
    modelId: 'provider/model',
    provider: 'genfeed',
    retiredAt: null,
  },
  {
    addedAt: '2026-09-10T00:00:00.000Z',
    id: 'raw.model',
    isCompiled: false,
    label: 'Model',
    mediums: ['image'],
    modelId: 'provider/model',
    provider: 'provider',
    retiredAt: null,
  },
];

const TASKS = [
  {
    id: 'text-in-image',
    isDraft: false,
    medium: 'image',
    outputSpec: { aspectRatio: '4:5', count: 1 },
    prompt: 'A sandwich board that reads CLOSED MONDAYS',
    rationale: 'Legible text is the most commercially decisive capability.',
    referenceRoles: ['none'],
    rubric: ['Is every character correct?'],
    title: 'Legible text',
    version: 1,
  },
  {
    id: 'motion-coherence',
    isDraft: true,
    medium: 'video',
    outputSpec: { aspectRatio: '16:9', count: 1, durationSeconds: 5 },
    prompt: 'A courier carries four boxes across a pavement.',
    rationale: 'Whether a subject survives its own movement.',
    referenceRoles: ['none'],
    rubric: ['Do the boxes stay the same four boxes?'],
    title: 'Motion coherence',
    version: 1,
  },
];

function mockFetchOnce(responses: Record<string, unknown>, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const key = Object.keys(responses).find((one) => url.includes(one));

      return {
        json: async () => (key ? responses[key] : null),
        ok: status === 200 && key !== undefined,
        status: key === undefined ? 404 : status,
      };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('benchmark loader', () => {
  it('reads the season, contestants and tasks from the public bench', async () => {
    mockFetchOnce({
      'data/contestants.json': CONTESTANTS,
      'data/seasons/s1-image.json': SEASON,
      'data/tasks.json': TASKS,
    });

    const data = await getBenchmarkData('s1-image');

    expect(data?.season.id).toBe('s1-image');
    expect(data?.contestants).toHaveLength(2);
    expect(data?.tasks).toHaveLength(2);
  });

  it('returns null rather than a stale ladder when the bench is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    // A benchmark that invents numbers when its source is unreachable is worse
    // than one that admits it cannot read them.
    await expect(getBenchmarkData('s1-unreachable')).resolves.toBeNull();
  });

  it('drops a malformed season instead of throwing inside a render', async () => {
    mockFetchOnce({
      'data/contestants.json': CONTESTANTS,
      'data/seasons/s1-broken.json': { id: 's1-broken', state: 'nonsense' },
      'data/tasks.json': TASKS,
    });

    await expect(getBenchmarkData('s1-broken')).resolves.toBeNull();
  });
});

describe('benchmark page', () => {
  it('says the ladder is empty on purpose when no match is recorded', () => {
    render(
      <BenchmarkContent
        data={{
          contestants: CONTESTANTS,
          season: SEASON,
          tasks: TASKS,
        }}
      />,
    );

    expect(
      screen.getByText('The ladder is empty on purpose.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/no match recorded/)).toBeInTheDocument();
  });

  it('ranks contestants once matches exist', () => {
    render(
      <BenchmarkContent
        data={{
          contestants: CONTESTANTS,
          season: {
            ...SEASON,
            ladder: [
              {
                contestantId: 'raw.model',
                losses: 0,
                matches: 1,
                rank: 1,
                rating: 1512,
                voids: 0,
                wins: 1,
              },
              {
                contestantId: 'genfeed-compiled.model',
                losses: 1,
                matches: 1,
                rank: 2,
                rating: 1488,
                voids: 0,
                wins: 0,
              },
            ],
            matchCount: 1,
          },
          tasks: TASKS,
        }}
      />,
    );

    expect(screen.getByText('1512')).toBeInTheDocument();
    // The compiled route ranking below the raw model it wraps is the result
    // the bench exists to be able to publish.
    expect(screen.getByText('1488')).toBeInTheDocument();
    expect(
      screen.queryByText('The ladder is empty on purpose.'),
    ).not.toBeInTheDocument();
  });

  it('publishes the full prompt for every runnable task', () => {
    render(
      <BenchmarkContent
        data={{ contestants: CONTESTANTS, season: SEASON, tasks: TASKS }}
      />,
    );

    expect(
      screen.getByText('A sandwich board that reads CLOSED MONDAYS'),
    ).toBeInTheDocument();
  });

  it('marks video tasks as Season Two drafts rather than listing them as live', () => {
    render(
      <BenchmarkContent
        data={{ contestants: CONTESTANTS, season: SEASON, tasks: TASKS }}
      />,
    );

    expect(screen.getByText('Season Two draft')).toBeInTheDocument();
    expect(screen.getByText('Motion coherence')).toBeInTheDocument();
  });

  it('refuses to render a ladder when the bench cannot be read', () => {
    render(<BenchmarkContent data={null} />);

    expect(
      screen.getByText('The bench could not be read.'),
    ).toBeInTheDocument();
  });
});
