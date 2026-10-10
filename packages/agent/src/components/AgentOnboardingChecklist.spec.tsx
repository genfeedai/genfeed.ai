import { AgentOnboardingChecklist } from '@genfeedai/agent/components/AgentOnboardingChecklist';
import { buildOnboardingBrandContextPanel } from '@genfeedai/agent/utils/onboarding-brand-context.util';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const brandContext = buildOnboardingBrandContextPanel(62, {
  fields: {
    goals: { status: 'answered', updatedAt: '2026-10-10T00:00:00Z' },
    audience: { status: 'answered', updatedAt: '2026-10-10T00:00:00Z' },
    offer: { status: 'skipped', updatedAt: '2026-10-10T00:00:00Z' },
  },
  hasScannedWebsite: true,
});

function rowFor(label: RegExp) {
  const row = screen.getByText(label).closest('li');
  if (!row) throw new Error('Missing row');
  return row;
}

describe('AgentOnboardingChecklist brand context mode', () => {
  it('shows the live score, earned credits and a row per card with its state', () => {
    render(<AgentOnboardingChecklist brandContext={brandContext} steps={[]} />);

    expect(screen.getByText('Brand context')).toBeInTheDocument();
    expect(
      screen.getByTestId('onboarding-brand-context-score'),
    ).toHaveTextContent('62%');
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '62',
    );
    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual([
      'Website',
      'Goal+5 earned',
      'Audience+5 earned',
      'Offer (skipped)+5',
      'Competitors+5',
      'Platforms+5',
      'Tone+5',
      'Cadence+5',
    ]);
    expect(rowFor(/^Website$/)).toHaveAttribute('data-status', 'done');
    expect(rowFor(/^Offer/)).toHaveAttribute('data-status', 'skipped');
    expect(rowFor(/^Competitors$/)).toHaveAttribute('data-status', 'now');
    expect(rowFor(/^Cadence$/)).toHaveAttribute('data-status', 'todo');
    expect(screen.queryByText('Activation Journey')).not.toBeInTheDocument();
  });

  it('hides every credit affordance when rewards are not visible', () => {
    render(
      <AgentOnboardingChecklist
        brandContext={brandContext}
        isCreditRewardsVisible={false}
        steps={[]}
      />,
    );

    expect(screen.queryByText('Credits earned')).not.toBeInTheDocument();
    expect(within(rowFor(/^Goal$/)).queryByText(/\+5/)).not.toBeInTheDocument();
  });

  it('starts at the website before any scan and shows no score yet', () => {
    render(
      <AgentOnboardingChecklist
        brandContext={buildOnboardingBrandContextPanel(null, null)}
        steps={[]}
      />,
    );

    expect(
      screen.getByTestId('onboarding-brand-context-score'),
    ).toHaveTextContent('–');
    expect(rowFor(/^Website$/)).toHaveAttribute('data-status', 'now');
    expect(screen.getByText('Starts with your website')).toBeInTheDocument();
  });

  it('marks the website skipped once cards start without a scan', () => {
    const panel = buildOnboardingBrandContextPanel(20, {
      fields: {
        goals: { status: 'answered', updatedAt: '2026-10-10T00:00:00Z' },
      },
      hasScannedWebsite: false,
    });
    expect(panel.rows.map((row) => [row.id, row.status])).toEqual([
      ['website', 'skipped'],
      ['goals', 'done'],
      ['audience', 'now'],
      ['offer', 'todo'],
      ['competitors', 'todo'],
      ['platforms', 'todo'],
      ['tone', 'todo'],
      ['cadence', 'todo'],
    ]);
    expect(panel.creditsEarned).toBe(5);
  });
});
