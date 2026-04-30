import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPostRemix from '@ui/modals/content/remix/ModalPostRemix';

const meta: Meta<typeof ModalPostRemix> = {
  component: ModalPostRemix,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Modals/ModalPostRemix',
};

export default meta;
type Story = StoryObj<typeof ModalPostRemix>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
