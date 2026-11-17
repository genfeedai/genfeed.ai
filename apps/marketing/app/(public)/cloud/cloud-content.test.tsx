import { PLAN_COPY } from '@genfeedai/pricing';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CloudContent from './cloud-content';

vi.mock('@web-components/PageLayout', () => ({
  default: ({
    children,
    description,
    title,
  }: {
    children: ReactNode;
    description: string;
    title: string;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

describe('CloudContent', () => {
  it('states which plans share seats, matching the pricing contract', () => {
    render(<CloudContent />);

    expect(
      screen.getByText(
        new RegExp(
          `Shared seats start on ${PLAN_COPY.scale.name}; ${PLAN_COPY.payg.name} and ${PLAN_COPY.pro.name} are one seat`,
        ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `On ${PLAN_COPY.scale.name} and ${PLAN_COPY.enterprise.name}, every teammate connects their own agent to the same workspace, brand library, and approvals.`,
      ),
    ).toBeInTheDocument();
  });
});
