import type { IPostingSignature } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PostingSignaturePicker from './PostingSignaturePicker';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function makeSignature(
  overrides: Partial<IPostingSignature> = {},
): IPostingSignature {
  return {
    body: '— Genfeed',
    id: 'sig-1',
    isEnabled: true,
    label: 'Launch sign-off',
    organizationId: 'org-1',
    placement: 'append',
    platforms: ['twitter'],
    userId: 'user-1',
    ...overrides,
  } as IPostingSignature;
}

describe('PostingSignaturePicker', () => {
  it('toggles signatures that apply to the current platform', () => {
    const onChange = vi.fn();
    render(
      <PostingSignaturePicker
        onChange={onChange}
        platform="twitter"
        selectedIds={[]}
        signatures={[
          makeSignature(),
          makeSignature({
            id: 'sig-2',
            label: 'LinkedIn closer',
            platforms: ['linkedin'],
          }),
        ]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Launch sign-off' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'LinkedIn closer' }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Launch sign-off' }));
    expect(onChange).toHaveBeenCalledWith(['sig-1']);
  });
});
