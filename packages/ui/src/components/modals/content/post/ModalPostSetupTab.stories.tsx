import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPostSetupTab from '@ui/modals/content/post/ModalPostSetupTab';

const meta: Meta<typeof ModalPostSetupTab> = {
  argTypes: {},
  component: ModalPostSetupTab,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPostSetupTab',
};

export default meta;
type Story = StoryObj<typeof ModalPostSetupTab>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
