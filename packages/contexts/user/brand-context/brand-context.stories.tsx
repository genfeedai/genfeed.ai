import BrandContext from '@genfeedai/contexts/user/brand-context/brand-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof BrandContext> = {
  argTypes: {},
  component: BrandContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Contexts/User/BrandContext',
};

export default meta;
type Story = StoryObj<typeof BrandContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
