import type { LearningPromptSlotOutcomeReport } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LearningPage from './learning-page';

const getReport = vi.hoisted(() => vi.fn());

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ getReport }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  const translations = new Map<
    string,
    ReturnType<typeof translateFromCatalog>
  >();
  return {
    useTranslations: (namespace: string) => {
      if (!translations.has(namespace))
        translations.set(namespace, translateFromCatalog(namespace));
      return translations.get(namespace);
    },
  };
});

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, label }: { children: ReactNode; label: string }) => (
    <section aria-label={label}>{children}</section>
  ),
}));

function report(
  overrides: Partial<LearningPromptSlotOutcomeReport> = {},
): LearningPromptSlotOutcomeReport {
  return {
    groups: [
      {
        category: 'IMAGE',
        comparison: {
          alpha: 0.05,
          comparisonCount: 2,
          comparisons: [
            {
              difference: 0,
              filled: { count: 3, mean: 0.1 },
              lower: -0.2,
              rest: { count: 40, mean: 0.1 },
              slot: 'mood',
              upper: 0.2,
              value: null,
              verdict: 'insufficient_data',
            },
            {
              difference: 0.7,
              filled: { count: 25, mean: 0.5 },
              lower: 0.4,
              rest: { count: 25, mean: -0.2 },
              slot: 'lighting',
              upper: 1,
              value: null,
              verdict: 'better',
            },
          ],
          excludedCount: 0,
          observationCount: 50,
        },
        objective: 'engagement',
        postCount: 50,
      },
    ],
    isPooled: false,
    isTruncated: false,
    organizationIds: ['org-1'],
    postCount: 50,
    skipped: { noPrompt: 1, noSlots: 2, noValidReward: 3 },
    ...overrides,
  };
}

function submit(organizations: string) {
  fireEvent.change(screen.getByLabelText('Organization IDs'), {
    target: { value: organizations },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Run report' }));
}

describe('LearningPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('waits for an organization before asking for a report', () => {
    render(<LearningPage />);

    expect(screen.getByRole('button', { name: 'Run report' })).toBeDisabled();
    expect(getReport).not.toHaveBeenCalled();
  });

  it('requests the parsed organizations and lists decided verdicts first', async () => {
    getReport.mockResolvedValue(report());
    render(<LearningPage />);

    fireEvent.change(screen.getByLabelText('Brand ID (optional)'), {
      target: { value: ' brand-1 ' },
    });
    submit('org-1, org-2 org-1');

    await waitFor(() => expect(screen.getByText('Better')).toBeVisible());
    expect(getReport).toHaveBeenCalledWith(
      { brandId: 'brand-1', organizationIds: ['org-1', 'org-2'] },
      expect.any(AbortSignal),
    );
    const slots = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent ?? '');
    expect(slots[0]).toContain('lighting');
    expect(slots[1]).toContain('mood');
    expect(screen.getByText('Not enough data')).toBeVisible();
    expect(
      screen.getByText(
        'Left out: 3 without a valid reward, 1 without a stored prompt, 2 with a prompt that predates structured slots.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Pooled across organizations')).toBeNull();
  });

  it('warns that a pooled report is a weaker lead', async () => {
    getReport.mockResolvedValue(
      report({
        isPooled: true,
        isTruncated: true,
        organizationIds: ['a', 'b'],
      }),
    );
    render(<LearningPage />);

    submit('a,b');

    await waitFor(() =>
      expect(screen.getByText('Pooled across organizations')).toBeVisible(),
    );
    expect(
      screen.getByText(
        'The post limit was reached, so older posts were not read.',
      ),
    ).toBeVisible();
  });

  it('says so when nothing is comparable', async () => {
    getReport.mockResolvedValue(report({ groups: [], postCount: 0 }));
    render(<LearningPage />);

    submit('org-1');

    await waitFor(() =>
      expect(
        screen.getByText(
          'No posts with a measured reward and structured prompt slots were found.',
        ),
      ).toBeVisible(),
    );
  });

  it('offers a retry when the report fails', async () => {
    getReport.mockRejectedValueOnce(new Error('boom'));
    getReport.mockResolvedValueOnce(report());
    render(<LearningPage />);

    submit('org-1');
    await waitFor(() =>
      expect(
        screen.getByText('The learning report could not be loaded.'),
      ).toBeVisible(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry report' }));
    await waitFor(() => expect(screen.getByText('Better')).toBeVisible());
  });
});
