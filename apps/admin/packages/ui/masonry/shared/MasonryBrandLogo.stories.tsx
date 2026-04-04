import type { Meta, StoryObj } from '@storybook/nextjs';
import MasonryBrandLogo from '@ui/masonry/shared/MasonryBrandLogo';

const meta: Meta<typeof MasonryBrandLogo> = {
  argTypes: {},
  component: MasonryBrandLogo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Masonry/MasonryBrandLogo',
};

export default meta;
type Story = StoryObj<typeof MasonryBrandLogo>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
