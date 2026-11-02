import type { LearningPromptSlotOutcomeReport } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import LearningReportPanel from './learning-report-panel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../tests/next-intl.stub'
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

function renderPanel(
  props: Partial<ComponentProps<typeof LearningReportPanel>> = {},
) {
  return render(
    <LearningReportPanel
      hasOrganization
      isError={false}
      isLoading={false}
      onRetry={vi.fn()}
      report={report()}
      {...props}
    />,
  );
}

describe('LearningReportPanel', () => {
  it('asks for an organization before it has one', () => {
    renderPanel({ hasOrganization: false, report: undefined });

    expect(
      screen.getByText(
        'Choose an organization to see which prompt slots go with better or worse results.',
      ),
    ).toBeVisible();
  });

  it('lists decided verdicts first and explains what was left out', () => {
    renderPanel();

    const slots = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent ?? '');
    expect(slots[0]).toContain('lighting');
    expect(slots[0]).toContain('Better');
    expect(slots[1]).toContain('mood');
    expect(screen.getByText('Not enough data')).toBeVisible();
    expect(screen.getByText('50 posts read.')).toBeVisible();
    expect(
      screen.getByText(
        'Left out: 3 without a valid reward, 1 without a stored prompt, 2 with a prompt that predates structured slots.',
      ),
    ).toBeVisible();
  });

  it('says when the post limit cut the report short', () => {
    renderPanel({ report: report({ isTruncated: true }) });

    expect(
      screen.getByText(
        'The post limit was reached, so older posts were not read.',
      ),
    ).toBeVisible();
  });

  it('says so when nothing is comparable', () => {
    renderPanel({ report: report({ groups: [], postCount: 0 }) });

    expect(
      screen.getByText(
        'No posts with a measured reward and structured prompt slots were found.',
      ),
    ).toBeVisible();
  });

  it('shows a loading state while the report is read', () => {
    renderPanel({ isLoading: true, report: undefined });

    expect(
      screen.getByRole('status', { name: 'Loading learning report' }),
    ).toBeVisible();
  });

  it('offers a retry when the report fails', () => {
    const onRetry = vi.fn();
    renderPanel({ isError: true, onRetry, report: undefined });

    expect(
      screen.getByText('The learning report could not be loaded.'),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry report' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
