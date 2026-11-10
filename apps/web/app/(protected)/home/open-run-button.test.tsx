// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const automation = vi.hoisted(() => ({ isAvailable: true }));

vi.mock('@/components/shell/use-available-rail-apps', () => ({
  useIsAppAvailable: (appId: string) =>
    appId === 'automation' && automation.isAvailable,
}));

import OpenRunButton from './open-run-button';

describe('OpenRunButton', () => {
  beforeEach(() => {
    automation.isAvailable = true;
  });

  it('opens the run while the organization has Automation', () => {
    render(<OpenRunButton href="/acme/~/automation/runs/run-1" label="Open" />);

    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/acme/~/automation/runs/run-1',
    );
  });

  it('is absent while the organization has no Automation', () => {
    automation.isAvailable = false;

    render(<OpenRunButton href="/acme/~/automation/runs/run-1" label="Open" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
