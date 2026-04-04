import SoundsList from '@pages/elements/sounds/sounds-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof SoundsList> = {
  argTypes: {},
  component: SoundsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/SoundsList',
};

export default meta;
type Story = StoryObj<typeof SoundsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
