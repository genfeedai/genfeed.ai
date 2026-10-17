import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OrganizationReleaseGrants from './organization-release-grants';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderGrants(
  overrides: Partial<Parameters<typeof OrganizationReleaseGrants>[0]> = {},
) {
  const onReleasedItemIdsChange = vi.fn().mockResolvedValue(undefined);
  const onModuleOverridesChange = vi.fn().mockResolvedValue(undefined);
  render(
    <OrganizationReleaseGrants
      hasOrganizationBilling
      isReleasePreviewEnabled={false}
      moduleOverrides={{}}
      releasedItemIds={[]}
      onModuleOverridesChange={onModuleOverridesChange}
      onReleasedItemIdsChange={onReleasedItemIdsChange}
      {...overrides}
    />,
  );
  return { onModuleOverridesChange, onReleasedItemIdsChange };
}

describe('OrganizationReleaseGrants', () => {
  it('releases one item and keeps the others already released', async () => {
    const { onReleasedItemIdsChange } = renderGrants({
      releasedItemIds: ['motion'],
    });

    expect(
      screen.getByRole('switch', { name: 'release motion' }),
    ).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'release turbo' }),
    ).not.toBeChecked();

    await userEvent.click(
      screen.getByRole('switch', { name: 'release turbo' }),
    );

    await waitFor(() =>
      expect(onReleasedItemIdsChange).toHaveBeenCalledWith(['turbo', 'motion']),
    );
  });

  it('revokes a released item', async () => {
    const { onReleasedItemIdsChange } = renderGrants({
      releasedItemIds: ['motion', 'turbo'],
    });

    await userEvent.click(
      screen.getByRole('switch', { name: 'release motion' }),
    );

    await waitFor(() =>
      expect(onReleasedItemIdsChange).toHaveBeenCalledWith(['turbo']),
    );
  });

  it('hides Playground and Storyboard with an organization override', async () => {
    const { onModuleOverridesChange } = renderGrants({
      moduleOverrides: { storyboard: false },
    });

    expect(
      screen.getByRole('switch', { name: 'show playground' }),
    ).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'show storyboard' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'show motion' }),
    ).not.toBeChecked();

    await userEvent.click(
      screen.getByRole('switch', { name: 'show playground' }),
    );

    await waitFor(() =>
      expect(onModuleOverridesChange).toHaveBeenCalledWith({
        storyboard: false,
        playground: false,
      }),
    );
  });
});
