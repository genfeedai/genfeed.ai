import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalGallery from '@ui/modals/gallery/ModalGallery';

const meta: Meta<typeof ModalGallery> = {
  argTypes: {},
  component: ModalGallery,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalGallery',
};

export default meta;
type Story = StoryObj<typeof ModalGallery>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
