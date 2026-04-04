import type { Meta, StoryObj } from '@storybook/nextjs';
import TopbarShared from '@ui/topbars/shared/TopbarShared';

const meta: Meta<typeof TopbarShared> = {
  argTypes: {},
  component: TopbarShared,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Topbars/TopbarShared',
};

export default meta;
type Story = StoryObj<typeof TopbarShared>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
