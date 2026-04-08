import type { Meta, StoryObj } from '@storybook/nextjs';
import FormDateRangePicker from '@ui/primitives/date-range-picker';

const meta: Meta<typeof FormDateRangePicker> = {
  argTypes: {},
  component: FormDateRangePicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Forms/FormDateRangePicker',
};

export default meta;
type Story = StoryObj<typeof FormDateRangePicker>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
