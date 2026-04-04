import BrandDetailAccountSettingsCard from '@pages/brands/components/sidebar/BrandDetailAccountSettingsCard';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandDetailAccountSettingsCard> = {
  argTypes: {},
  component: BrandDetailAccountSettingsCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Brands/BrandDetailAccountSettingsCard',
};

export default meta;
type Story = StoryObj<typeof BrandDetailAccountSettingsCard>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
