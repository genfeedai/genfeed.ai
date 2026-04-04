import type { Meta, StoryObj } from '@storybook/nextjs';
import ModalPostPlatformsTab from '@ui/modals/content/post/ModalPostPlatformsTab';

const meta: Meta<typeof ModalPostPlatformsTab> = {
  argTypes: {},
  component: ModalPostPlatformsTab,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Modals/ModalPostPlatformsTab',
};

export default meta;
type Story = StoryObj<typeof ModalPostPlatformsTab>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
