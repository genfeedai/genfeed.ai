import type { Meta, StoryObj } from '@storybook/nextjs';
import PresetsList from './presets-list';

const meta: Meta<typeof PresetsList> = {
  argTypes: {},
  component: PresetsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/PresetsList',
};

export default meta;
type Story = StoryObj<typeof PresetsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
