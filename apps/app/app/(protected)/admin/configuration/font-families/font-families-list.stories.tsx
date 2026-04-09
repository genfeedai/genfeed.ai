import type { Meta, StoryObj } from '@storybook/nextjs';
import FontFamiliesList from './font-families-list';

const meta: Meta<typeof FontFamiliesList> = {
  argTypes: {},
  component: FontFamiliesList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/FontFamiliesList',
};

export default meta;
type Story = StoryObj<typeof FontFamiliesList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
