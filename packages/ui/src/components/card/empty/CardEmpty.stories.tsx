import type { Meta, StoryObj } from '@storybook/nextjs';
import CardEmpty from '@ui/card/empty/CardEmpty';

const meta: Meta<typeof CardEmpty> = {
  component: CardEmpty,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Ui/CardEmpty',
};

export default meta;
type Story = StoryObj<typeof CardEmpty>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
