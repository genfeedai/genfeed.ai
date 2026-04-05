import type { Meta, StoryObj } from '@storybook/nextjs';
import CardEmpty from '@ui/card/empty/CardEmpty';

const meta: Meta<typeof CardEmpty> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
