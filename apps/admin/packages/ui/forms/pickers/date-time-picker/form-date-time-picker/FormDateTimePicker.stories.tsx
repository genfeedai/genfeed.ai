import type { Meta, StoryObj } from '@storybook/nextjs';
import FormDateTimePicker from '@ui/forms/pickers/date-time-picker/form-date-time-picker/FormDateTimePicker';

const meta: Meta<typeof FormDateTimePicker> = {
  argTypes: {},
  component: FormDateTimePicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Forms/FormDateTimePicker',
};

export default meta;
type Story = StoryObj<typeof FormDateTimePicker>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
