import type { Meta, StoryObj } from '@storybook/nextjs';
import GallerySidebar from '@ui/gallery/sidebar/GallerySidebar';

const meta: Meta<typeof GallerySidebar> = {
  argTypes: {},
  component: GallerySidebar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/gallerySidebar',
};

export default meta;
type Story = StoryObj<typeof GallerySidebar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
