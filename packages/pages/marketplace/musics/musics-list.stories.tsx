import MusicsList from '@pages/marketplace/musics/musics-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof MusicsList> = {
  argTypes: {},
  component: MusicsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/MusicsList',
};

export default meta;
type Story = StoryObj<typeof MusicsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
