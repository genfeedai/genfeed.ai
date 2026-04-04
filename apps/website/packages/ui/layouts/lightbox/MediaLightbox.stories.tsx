import type { Meta, StoryObj } from '@storybook/nextjs';
import MediaLightbox from '@ui/layouts/lightbox/MediaLightbox';

const meta: Meta<typeof MediaLightbox> = {
  argTypes: {},
  component: MediaLightbox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Layouts/MediaLightbox',
};

export default meta;
type Story = StoryObj<typeof MediaLightbox>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
