import type { Meta, StoryObj } from '@storybook/nextjs';
import CardIcon from '@ui/card/icon/CardIcon';

const meta: Meta<typeof CardIcon> = {
  argTypes: {},
  component: CardIcon,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/CardIcon',
};

export default meta;
type Story = StoryObj<typeof CardIcon>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
