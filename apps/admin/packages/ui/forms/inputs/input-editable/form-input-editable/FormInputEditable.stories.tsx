import type { Meta, StoryObj } from '@storybook/nextjs';
import FormInputEditable from '@ui/forms/inputs/input-editable/form-input-editable/FormInputEditable';

const meta: Meta<typeof FormInputEditable> = {
  argTypes: {},
  component: FormInputEditable,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Forms/FormInputEditable',
};

export default meta;
type Story = StoryObj<typeof FormInputEditable>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
