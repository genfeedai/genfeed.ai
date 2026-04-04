import { GlobalModalsProvider } from '@providers/global-modals/global-modals.provider';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof GlobalModalsProvider> = {
  argTypes: {},
  component: GlobalModalsProvider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Providers/GlobalModals.provider.tsx/GlobalModalsProvider',
};

export default meta;
type Story = StoryObj<typeof GlobalModalsProvider>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
