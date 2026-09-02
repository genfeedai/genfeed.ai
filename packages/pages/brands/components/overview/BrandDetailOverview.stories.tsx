import { AssetScope } from '@genfeedai/contracts';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import BrandDetailOverview from '@pages/brands/components/overview/BrandDetailOverview';
import type { Meta, StoryObj } from '@storybook/nextjs';

const brand = {
  description: 'Content for ambitious teams',
  label: 'Acme',
  logoUrl: 'https://placehold.co/128x128',
  scope: AssetScope.BRAND,
  slug: 'acme',
} as IBrand;

const meta: Meta<typeof BrandDetailOverview> = {
  argTypes: {},
  component: BrandDetailOverview,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailOverview',
};

export default meta;
type Story = StoryObj<typeof BrandDetailOverview>;

export const Default: Story = {
  args: {
    brand,
    isGeneratingLogo: false,
    onGenerateLogo: () => undefined,
    onUpdateBrand: async () => undefined,
    onUploadLogo: () => undefined,
  },
};

export const Interactive: Story = {
  args: {
    ...Default.args,
    brand: {
      ...brand,
      description: '',
      label: 'Editable brand',
    },
  },
};
