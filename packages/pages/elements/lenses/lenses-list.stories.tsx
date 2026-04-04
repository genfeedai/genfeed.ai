import LensesList from '@pages/elements/lenses/lenses-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof LensesList> = {
  argTypes: {},
  component: LensesList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/LensesList',
};

export default meta;
type Story = StoryObj<typeof LensesList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
