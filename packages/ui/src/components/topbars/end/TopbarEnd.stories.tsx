import type { Meta, StoryObj } from '@storybook/nextjs';
import TopbarEnd from '@ui/topbars/end/TopbarEnd';

const meta: Meta<typeof TopbarEnd> = {
  argTypes: {},
  component: TopbarEnd,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Topbars/TopbarEnd',
};

export default meta;
type Story = StoryObj<typeof TopbarEnd>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
