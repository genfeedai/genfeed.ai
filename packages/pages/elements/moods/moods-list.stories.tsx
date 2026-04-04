import MoodsList from '@pages/elements/moods/moods-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof MoodsList> = {
  argTypes: {},
  component: MoodsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/MoodsList',
};

export default meta;
type Story = StoryObj<typeof MoodsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
