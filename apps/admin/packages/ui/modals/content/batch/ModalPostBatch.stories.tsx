import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPostBatch from '@ui/modals/content/batch/ModalPostBatch';

const meta: Meta<typeof ModalPostBatch> = {
  argTypes: {},
  component: ModalPostBatch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPostBatch',
};

export default meta;
type Story = StoryObj<typeof ModalPostBatch>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
