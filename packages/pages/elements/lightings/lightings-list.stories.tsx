import LightingsList from '@pages/elements/lightings/lightings-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

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
