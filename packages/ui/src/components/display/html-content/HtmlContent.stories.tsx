import type { Meta, StoryObj } from '@storybook/nextjs';
import HtmlContent from '@ui/display/html-content/HtmlContent';

const meta: Meta<typeof HtmlContent> = {
  component: HtmlContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Ui/HtmlContent',
};

export default meta;
type Story = StoryObj<typeof HtmlContent>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
