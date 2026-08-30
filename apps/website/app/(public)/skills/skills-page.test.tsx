import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillRegistry } from './_data';

vi.mock('@hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    description,
    heroActions,
    title,
  }: {
    children: ReactNode;
    description: string;
    heroActions: ReactNode;
    title: ReactNode;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {heroActions}
      {children}
    </main>
  ),
}));

vi.mock('@web-components/content/NeuralGrid', () => ({
  CtaSection: ({ children, title }: { children: ReactNode; title: string }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  NeuralGrid: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  NeuralGridItem: ({
    description,
    title,
  }: {
    description: string;
    title: string;
  }) => (
    <li>
      <h3>{title}</h3>
      <p>{description}</p>
    </li>
  ),
  WebSection: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

const { default: SkillsContent } = await import('./skills-content');
const { default: Skills } = await import('./page');
const { getSkillsRegistry } = await import('./skills-loader');
const { FREE_SKILL_COUNT, SKILL_CATEGORIES, TERMINAL_COMMANDS } = await import(
  './_data'
);

function registry(overrides: Partial<SkillRegistry> = {}): SkillRegistry {
  return {
    bundlePrice: 4900,
    skills: [
      {
        category: 'Growth',
        description: 'Warm up a new account safely.',
        name: 'Platform Warmup',
        slug: 'platform-warmup',
      },
    ],
    ...overrides,
  } as SkillRegistry;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('_data', () => {
  it('derives the free skill count from the category skill lists', () => {
    const expected = SKILL_CATEGORIES.reduce(
      (total, category) => total + category.skills.length,
      0,
    );

    expect(FREE_SKILL_COUNT).toBe(expected);
    expect(FREE_SKILL_COUNT).toBeGreaterThan(0);
    expect(TERMINAL_COMMANDS.length).toBeGreaterThan(0);
  });
});

describe('getSkillsRegistry', () => {
  it('returns the parsed registry on a 200', async () => {
    const payload = registry();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ json: () => Promise.resolve(payload), ok: true }),
      ),
    );

    await expect(getSkillsRegistry()).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/skills-pro/storefront'),
      expect.any(Object),
    );
  });

  it('returns null when the registry answers with an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ json: () => Promise.resolve({}), ok: false }),
      ),
    );

    await expect(getSkillsRegistry()).resolves.toBeNull();
  });

  it('returns null when the request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    await expect(getSkillsRegistry()).resolves.toBeNull();
  });
});

describe('Skills route', () => {
  it('hands the loaded registry to the content component', async () => {
    const payload = registry();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ json: () => Promise.resolve(payload), ok: true }),
      ),
    );

    const element = (await Skills()) as ReactElement<{
      initialRegistry: SkillRegistry | null;
    }>;

    expect(element.props.initialRegistry).toEqual(payload);
  });
});

describe('SkillsContent', () => {
  it('renders every free skill category', () => {
    render(<SkillsContent initialRegistry={null} />);

    for (const category of SKILL_CATEGORIES) {
      expect(
        screen.getByRole('heading', { level: 2, name: category.title }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByText('Pro Skills')).not.toBeInTheDocument();
  });

  it('renders the premium section when the registry has skills', () => {
    render(<SkillsContent initialRegistry={registry()} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Pro Skills' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Platform Warmup')).toBeInTheDocument();
  });

  it('hides the premium section for an empty registry', () => {
    render(<SkillsContent initialRegistry={registry({ skills: [] })} />);

    expect(screen.queryByText('Pro Skills')).not.toBeInTheDocument();
  });
});

describe('InstallCommand', () => {
  it('shows the install command and confirms after a successful copy', async () => {
    const { default: InstallCommand } = await import('./install-command');
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const { container } = render(<InstallCommand />);
    expect(
      screen.getByText('bunx skills add genfeedai/skills'),
    ).toBeInTheDocument();

    const trigger = container.querySelector('button');
    trigger?.click();

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        'bunx skills add genfeedai/skills',
      );
    });
  });

  it('stays silent when the clipboard write fails', async () => {
    const { default: InstallCommand } = await import('./install-command');
    const writeText = vi.fn(() => Promise.reject(new Error('denied')));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const { container } = render(<InstallCommand />);
    container.querySelector('button')?.click();

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    expect(
      screen.getByText('bunx skills add genfeedai/skills'),
    ).toBeInTheDocument();
  });
});

describe('TerminalDemo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('types the demo lines out one at a time until the script ends', async () => {
    const { default: TerminalDemo } = await import('./terminal-demo');
    const { container } = render(<TerminalDemo />);

    expect(container.textContent).not.toContain(TERMINAL_COMMANDS[0]?.command);

    for (let step = 0; step <= TERMINAL_COMMANDS.length * 2; step += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
    }

    for (const line of TERMINAL_COMMANDS) {
      expect(container.textContent).toContain(line.command);
    }
  });
});
