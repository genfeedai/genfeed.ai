import type { Meta, StoryObj } from '@storybook/nextjs';
import FormSearchbar from '@ui/forms/inputs/searchbar/form-searchbar/FormSearchbar';

const meta: Meta<typeof FormSearchbar> = {
  argTypes: {},
  component: FormSearchbar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Forms/FormSearchbar',
};

export default meta;
type Story = StoryObj<typeof FormSearchbar>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
