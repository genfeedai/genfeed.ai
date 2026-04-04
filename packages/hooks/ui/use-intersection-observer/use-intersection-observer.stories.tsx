import UseIntersectionObserver from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof UseIntersectionObserver> = {
  argTypes: {},
  component: UseIntersectionObserver,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Hooks/Ui/UseIntersectionObserver',
};

export default meta;
type Story = StoryObj<typeof UseIntersectionObserver>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
