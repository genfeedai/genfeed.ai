import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalBrandGenerate from '@ui/modals/brands/generate/ModalBrandGenerate';

const meta: Meta<typeof ModalBrandGenerate> = {
  argTypes: {},
  component: ModalBrandGenerate,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalBrandGenerate',
};

export default meta;
type Story = StoryObj<typeof ModalBrandGenerate>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
