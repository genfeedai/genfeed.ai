import { CommandPaletteProvider } from '@contexts/features/command-palette.context';
// @ts-expect-error storybook types not available
import type { Meta, StoryObj } from '@storybook/react';
import { CommandPaletteInitializer } from '@ui/command-palette/command-palette-initializer/CommandPaletteInitializer';
import type { ReactElement } from 'react';

const meta = {
  component: CommandPaletteInitializer,
  decorators: [
    (Story: () => ReactElement) => (
      <CommandPaletteProvider>
        <Story />
      </CommandPaletteProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Logic-only component that wires default commands and admin-only commands into the palette. Include it once at the root of any protected layout.',
      },
    },
  },
  title: 'Components/CommandPalette/CommandPaletteInitializer',
} satisfies Meta<typeof CommandPaletteInitializer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <div className="p-4 text-sm">
      <p>
        Command palette initialization is handled automatically. This story only
        documents the component because it does not render visible UI.
      </p>
      <CommandPaletteInitializer />
    </div>
  ),
};
