import type { Meta, StoryObj } from '@storybook/nextjs';
import FormDropzone from '@ui/forms/upload/form-dropzone/FormDropzone';

const meta: Meta<typeof FormDropzone> = {
  argTypes: {},
  component: FormDropzone,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Forms/FormDropzone',
};

export default meta;
type Story = StoryObj<typeof FormDropzone>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
