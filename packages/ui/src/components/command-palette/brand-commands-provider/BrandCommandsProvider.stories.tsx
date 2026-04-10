import { PLATFORM_COLORS } from '@genfeedai/constants';
import { CommandPaletteProvider } from '@genfeedai/contexts/features/command-palette.context';
import type { Meta, StoryObj } from '@storybook/nextjs';
import { BrandCommandsProvider } from '@ui/command-palette/brand-commands-provider/BrandCommandsProvider';

const brands = [
  {
    color: PLATFORM_COLORS.youtube,
    id: 'alpha',
    label: 'Alpha Labs',
    slug: 'alpha',
  },
  {
    color: PLATFORM_COLORS.tiktok,
    id: 'beta',
    label: 'Beta Corp',
    slug: 'beta',
  },
];

const meta = {
  args: {
    brandId: 'alpha',
    brands: brands as any,
  },
  component: BrandCommandsProvider,
  decorators: [
    (Story) => (
      <CommandPaletteProvider>
        <Story />
      </CommandPaletteProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Logic-only provider that registers dynamic brand switching commands. It renders nothing by design.',
      },
    },
  },
  title: 'Components/CommandPalette/BrandCommandsProvider',
} satisfies Meta<typeof BrandCommandsProvider>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="space-y-3 text-sm">
      <p>Brand commands are registered for the following brands:</p>
      <ul className="list-disc pl-4">
        {args.brands.map((brand: { id: string; label: string }) => (
          <li key={brand.id}>{brand.label}</li>
        ))}
      </ul>
      <BrandCommandsProvider {...args} />
    </div>
  ),
};
