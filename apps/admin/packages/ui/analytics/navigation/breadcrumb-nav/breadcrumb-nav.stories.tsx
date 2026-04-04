import type { Meta, StoryObj } from '@storybook/nextjs';
import { BreadcrumbNav } from '@ui/analytics/navigation/breadcrumb-nav/breadcrumb-nav';

const meta: Meta<typeof BreadcrumbNav> = {
  argTypes: {},
  component: BreadcrumbNav,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Analytics/BreadcrumbNav',
};

export default meta;
type Story = StoryObj<typeof BreadcrumbNav>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
