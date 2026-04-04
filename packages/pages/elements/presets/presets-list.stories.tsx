import PresetsList from '@pages/elements/presets/presets-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

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
