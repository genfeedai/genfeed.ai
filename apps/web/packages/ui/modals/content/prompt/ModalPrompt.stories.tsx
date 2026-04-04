import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPrompt from '@ui/modals/content/prompt/ModalPrompt';

const meta: Meta<typeof ModalPrompt> = {
  argTypes: {},
  component: ModalPrompt,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPrompt',
};

export default meta;
type Story = StoryObj<typeof ModalPrompt>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
