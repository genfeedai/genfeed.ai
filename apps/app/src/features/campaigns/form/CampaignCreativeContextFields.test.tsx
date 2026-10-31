import { fireEvent, render, screen } from '@testing-library/react';
import CampaignCreativeContextFields from './CampaignCreativeContextFields';

const mocks = vi.hoisted(() => ({ openGallery: vi.fn() }));
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useGalleryModal: () => ({ openGallery: mocks.openGallery }),
  }),
);
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values ? `${key} ${Object.values(values).join(' ')}` : key,
}));

it('edits campaign voice without replacing the surrounding campaign context', () => {
  const onChange = vi.fn();
  render(
    <CampaignCreativeContextFields
      brandId="brand-1"
      value={{ tone: 'Candid', assetIds: ['asset-1'] }}
      onChange={onChange}
    />,
  );
  fireEvent.change(screen.getByLabelText('context.tone'), {
    target: { value: 'Precise' },
  });
  expect(onChange).toHaveBeenCalledWith({ tone: 'Precise' });
});

it('keeps selected Library assets in the campaign brand and deduplicates them', () => {
  const onChange = vi.fn();
  render(
    <CampaignCreativeContextFields
      brandId="brand-1"
      value={{ assetIds: ['asset-1'] }}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'context.addImages' }));
  const selection = mocks.openGallery.mock.calls.at(-1)?.[0];
  selection.onSelect([
    { id: 'asset-1', brandId: 'brand-1' },
    { id: 'asset-2', brandId: 'brand-1' },
    { id: 'foreign', brandId: 'brand-2' },
    { id: 'deleted', brandId: 'brand-1', isDeleted: true },
  ]);
  expect(onChange).toHaveBeenCalledWith({ assetIds: ['asset-1', 'asset-2'] });
});

it('removes one asset without changing the remaining membership', () => {
  const onChange = vi.fn();
  render(
    <CampaignCreativeContextFields
      brandId="brand-1"
      value={{ assetIds: ['asset-1', 'asset-2'] }}
      onChange={onChange}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'context.removeAsset 1' }),
  );
  expect(onChange).toHaveBeenCalledWith({ assetIds: ['asset-2'] });
});

it('can add the final asset without counting existing membership twice', () => {
  render(
    <CampaignCreativeContextFields
      brandId="brand-1"
      value={{
        assetIds: Array.from({ length: 49 }, (_, index) => `asset-${index}`),
      }}
      onChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'context.addImages' }));
  const config = mocks.openGallery.mock.calls.at(-1)?.[0];
  expect(config.maxSelectableItems).toBe(1);
  expect(config.selectedReferences ?? []).toHaveLength(0);
});
