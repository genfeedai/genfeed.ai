import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import OrganizationReleaseGrants from './organization-release-grants';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('OrganizationReleaseGrants', () => {
  it('grants one release item and keeps the others', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <OrganizationReleaseGrants
        isReleasePreviewEnabled={false}
        releasedItemIds={['motion']}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('switch', { name: 'motion' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'turbo' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('switch', { name: 'turbo' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(['turbo', 'motion']),
    );
  });

  it('revokes a granted release item', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <OrganizationReleaseGrants
        isReleasePreviewEnabled={false}
        releasedItemIds={['motion', 'turbo']}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'motion' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['turbo']));
  });
});
