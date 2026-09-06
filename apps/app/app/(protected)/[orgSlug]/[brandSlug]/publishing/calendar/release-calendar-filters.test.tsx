import '@testing-library/jest-dom/vitest';
import { CredentialPlatform, ReleaseStatus } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

import ReleaseCalendarFilters, {
  EMPTY_RELEASE_CALENDAR_FILTERS,
} from './release-calendar-filters';

describe('nested calendar filters', () => {
  it('keeps multiple values and other categories when selecting a filter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ReleaseCalendarFilters
        filters={{
          ...EMPTY_RELEASE_CALENDAR_FILTERS,
          status: [ReleaseStatus.SCHEDULED],
          platform: [CredentialPlatform.INSTAGRAM],
        }}
        onChange={onChange}
        credentialOptions={[]}
        platformOptions={[
          { label: 'Instagram', value: CredentialPlatform.INSTAGRAM },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Calendar filters' }));
    const status = screen.getByRole('menuitem', { name: /Status/ });
    status.focus();
    await user.keyboard('{ArrowRight}');
    await user.click(
      await screen.findByRole('menuitemcheckbox', {
        name: ReleaseStatus.DRAFT,
      }),
    );
    expect(onChange).toHaveBeenCalledWith({
      ...EMPTY_RELEASE_CALENDAR_FILTERS,
      status: [ReleaseStatus.SCHEDULED, ReleaseStatus.DRAFT],
      platform: [CredentialPlatform.INSTAGRAM],
    });
    expect(
      screen.getByRole('menuitemcheckbox', { name: ReleaseStatus.DRAFT }),
    ).toBeVisible();
  });

  it('offers one trigger and clears all selected filters', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ReleaseCalendarFilters
        filters={{
          ...EMPTY_RELEASE_CALENDAR_FILTERS,
          status: [ReleaseStatus.SCHEDULED],
        }}
        onChange={onChange}
        credentialOptions={[]}
        platformOptions={[]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button')).toHaveTextContent('Filters (1)');
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('menuitem', { name: 'Clear filters' }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_RELEASE_CALENDAR_FILTERS);
  });
});
