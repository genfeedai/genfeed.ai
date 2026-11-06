import { createLibraryAssetRoute } from '@genfeedai/contracts/constants';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { CampaignCreativeContextFieldsProps } from '@/features/campaigns/props/campaign.props';
import CampaignCreativeContextFields from './CampaignCreativeContextFields';

type GalleryConfig = {
  maxSelectableItems?: number;
  onSelect: (
    items: { brandId: string; id: string; isDeleted?: boolean }[],
  ) => void;
  selectedReferences?: string[];
};

const gallery = vi.hoisted(() => ({ last: null as GalleryConfig | null }));
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useGalleryModal: () => ({
      openGallery: (config: GalleryConfig) => {
        gallery.last = config;
      },
    }),
  }),
);
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values ? `${key} ${Object.values(values).join(' ')}` : key,
}));

type CampaignContext = CampaignCreativeContextFieldsProps['value'];

// Mirrors the campaign form: each change is a patch merged into the campaign.
function CampaignHarness({ initial }: { initial: CampaignContext }) {
  const [value, setValue] = useState<CampaignContext>(initial);
  return (
    <CampaignCreativeContextFields
      brandId="brand-1"
      value={value}
      onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
    />
  );
}

function assetHref(assetId: string): string {
  return `/org/brand${createLibraryAssetRoute(undefined, assetId)}`;
}

beforeEach(() => {
  gallery.last = null;
});

it('edits campaign voice without replacing the surrounding campaign context', () => {
  render(
    <CampaignHarness initial={{ tone: 'Candid', assetIds: ['asset-1'] }} />,
  );
  fireEvent.change(screen.getByLabelText('context.tone'), {
    target: { value: 'Precise' },
  });
  expect(screen.getByLabelText('context.tone')).toHaveValue('Precise');
  expect(screen.getByText('context.assetCount 1')).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'context.viewAsset 1' }),
  ).toHaveAttribute('href', assetHref('asset-1'));
});

it('keeps selected Library assets in the campaign brand and deduplicates them', () => {
  render(<CampaignHarness initial={{ assetIds: ['asset-1'] }} />);
  fireEvent.click(screen.getByRole('button', { name: 'context.addImages' }));
  act(() => {
    gallery.last?.onSelect([
      { id: 'asset-1', brandId: 'brand-1' },
      { id: 'asset-2', brandId: 'brand-1' },
      { id: 'foreign', brandId: 'brand-2' },
      { id: 'deleted', brandId: 'brand-1', isDeleted: true },
    ]);
  });
  expect(screen.getByText('context.assetCount 2')).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'context.viewAsset 1' }),
  ).toHaveAttribute('href', assetHref('asset-1'));
  expect(
    screen.getByRole('link', { name: 'context.viewAsset 2' }),
  ).toHaveAttribute('href', assetHref('asset-2'));
});

it('removes one asset without changing the remaining membership', () => {
  render(<CampaignHarness initial={{ assetIds: ['asset-1', 'asset-2'] }} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'context.removeAsset 1' }),
  );
  expect(screen.getByText('context.assetCount 1')).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'context.viewAsset 1' }),
  ).toHaveAttribute('href', assetHref('asset-2'));
});

it('can add the final asset without counting existing membership twice', () => {
  render(
    <CampaignCreativeContextFields
      brandId="brand-1"
      value={{
        assetIds: Array.from({ length: 49 }, (_, index) => `asset-${index}`),
      }}
      onChange={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'context.addImages' }));
  expect(gallery.last?.maxSelectableItems).toBe(1);
  expect(gallery.last?.selectedReferences ?? []).toHaveLength(0);
});
