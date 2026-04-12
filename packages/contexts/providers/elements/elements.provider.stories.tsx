import ElementsProvider from '@providers/elements/elements.provider';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof ElementsProvider> = {
  argTypes: {},
  component: ElementsProvider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Providers/Elements.provider.tsx/ElementsProvider',
};

export default meta;
type Story = StoryObj<typeof ElementsProvider>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
