import type { Meta, StoryObj } from '@storybook/nextjs';
import BaseFormField from '@ui/forms/base/base-form-field/BaseFormField';

const meta: Meta<typeof BaseFormField> = {
  argTypes: {},
  component: BaseFormField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Forms/BaseFormField',
};

export default meta;
type Story = StoryObj<typeof BaseFormField>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
