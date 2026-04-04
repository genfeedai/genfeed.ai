import ActivitiesList from '@pages/activities/activities-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof ActivitiesList> = {
  argTypes: {},
  component: ActivitiesList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Activities/ActivitiesList',
};

export default meta;
type Story = StoryObj<typeof ActivitiesList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
