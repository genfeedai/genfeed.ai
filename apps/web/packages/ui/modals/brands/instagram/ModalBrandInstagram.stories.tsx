import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalBrandInstagram from '@ui/modals/brands/instagram/ModalBrandInstagram';

const meta: Meta<typeof ModalBrandInstagram> = {
  argTypes: {},
  component: ModalBrandInstagram,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalBrandInstagram',
};

export default meta;
type Story = StoryObj<typeof ModalBrandInstagram>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
