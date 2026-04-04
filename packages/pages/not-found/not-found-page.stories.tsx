import NotFoundPage from '@pages/not-found/not-found-page';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof NotFoundPage> = {
  argTypes: {},
  component: NotFoundPage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/NotFound/NotFoundPage',
};

export default meta;
type Story = StoryObj<typeof NotFoundPage>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
