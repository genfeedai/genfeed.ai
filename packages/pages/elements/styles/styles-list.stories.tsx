import StylesList from '@pages/elements/styles/styles-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof StylesList> = {
  argTypes: {},
  component: StylesList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/StylesList',
};

export default meta;
type Story = StoryObj<typeof StylesList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
