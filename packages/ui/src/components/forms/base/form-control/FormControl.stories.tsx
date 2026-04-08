import type { Meta, StoryObj } from '@storybook/nextjs';
import FormControl from '@ui/primitives/field';

const meta: Meta<typeof FormControl> = {
  argTypes: {},
  component: FormControl,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Forms/FormControl',
};

export default meta;
type Story = StoryObj<typeof FormControl>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
