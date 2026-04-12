import { ElementsFiltersProvider } from '@providers/elements-filters/elements-filters.provider';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof ElementsFiltersProvider> = {
  argTypes: {},
  component: ElementsFiltersProvider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title:
    'Components/Providers/ElementsFilters.provider.tsx/ElementsFiltersProvider',
};

export default meta;
type Story = StoryObj<typeof ElementsFiltersProvider>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
