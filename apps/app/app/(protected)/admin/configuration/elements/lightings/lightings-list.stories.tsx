import type { Meta, StoryObj } from '@storybook/nextjs';
import LightingsList from './lightings-list';

const meta: Meta<typeof LightingsList> = {
  argTypes: {},
  component: LightingsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/LightingsList',
};

export default meta;
type Story = StoryObj<typeof LightingsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
