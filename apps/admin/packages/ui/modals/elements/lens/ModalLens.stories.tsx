import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalLens from '@ui/modals/elements/lens/ModalLens';

const meta: Meta<typeof ModalLens> = {
  argTypes: {},
  component: ModalLens,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalLens',
};

export default meta;
type Story = StoryObj<typeof ModalLens>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
