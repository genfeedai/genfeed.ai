# Command Palette

A powerful command palette component for Genfeed.ai that provides quick access to all features via keyboard shortcuts.

## Folder Structure

```
packages/components/command-palette/
├── command-palette/
│   ├── CommandPalette.tsx            # Stateful wrapper that consumes context
│   ├── CommandPaletteView.tsx        # Presentational UI
│   ├── use-command-palette-dialog.ts # DOM helpers for dialog lifecycle
│   ├── CommandPalette.stories.tsx
│   └── *.test.tsx files
├── command-palette-item/             # Individual row component with tests/stories
├── command-palette-initializer/      # Default/admin command registration hooks
└── brand-commands-provider/          # Registers per-brand shortcuts
```

All exported surfaces now have colocated specs and Storybook stories, mirroring the button architecture for easier maintenance.

## Features

- ⌨️ **Keyboard First**: Quick access with `⌘K` / `Ctrl+K`
- 🔍 **Smart Search**: Fuzzy search with intelligent scoring
- 🎯 **Context Aware**: Only shows relevant commands
- 📝 **Recent Commands**: Quick access to frequently used actions
- ⚡ **Fast**: Optimized for performance
- 🎨 **Beautiful**: Smooth animations and modern design
- 🔧 **Extensible**: Easy to add custom commands

## Installation

### 1. Add Provider to Root Layout

```tsx
import { CommandPaletteProvider } from '@contexts/command-palette.context';
import { CommandPalette } from '@components/command-palette';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <CommandPaletteProvider>
          {children}
          <CommandPalette />
        </CommandPaletteProvider>
      </body>
    </html>
  );
}
```

### 2. Register Default Commands

`CommandPaletteInitializer` wires the defaults plus admin-only commands. Drop it near the top of protected layouts so registration happens automatically:

```tsx
import {
  CommandPalette,
  CommandPaletteInitializer,
} from '@components/command-palette';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CommandPaletteProvider>
      <CommandPaletteInitializer />
      {children}
      <CommandPalette />
    </CommandPaletteProvider>
  );
}
```

The initializer internally calls `registerDefaultCommands` and registers the admin shortcut when applicable, so you rarely need to invoke those APIs manually.

## Usage

### Basic Usage

The command palette automatically listens for `⌘K` / `Ctrl+K` keyboard shortcuts. Users can:

1. Press `⌘K` to open
2. Type to search commands
3. Use arrow keys to navigate
4. Press Enter to execute
5. Press Escape to close

### Programmatic Control

```tsx
import { useCommandPalette } from '@hooks/ui/use-command-palette';

function MyComponent() {
  const { open, close, toggle } = useCommandPalette();

  return <button onClick={open}>Open Command Palette</button>;
}
```

### Registering Custom Commands

```tsx
import { useCommandPalette } from '@hooks/ui/use-command-palette';
import { useEffect } from 'react';

function MyFeature() {
  const { registerCommand, unregisterCommand } = useCommandPalette();

  useEffect(() => {
    // Register command on mount
    registerCommand({
      id: 'my-custom-action',
      label: 'My Custom Action',
      description: 'Does something cool',
      icon: '⚡',
      category: 'actions',
      keywords: ['custom', 'action', 'cool'],
      priority: 5,
      action: () => {
        console.log('Custom action executed!');
      },
    });

    // Cleanup on unmount
    return () => {
      unregisterCommand('my-custom-action');
    };
  }, [registerCommand, unregisterCommand]);

  return <div>My Feature</div>;
}
```

### Conditional Commands

Commands can include a `condition` function that determines if they should be shown:

```tsx
registerCommand({
  id: 'admin-action',
  label: 'Admin Panel',
  category: 'navigation',
  condition: () => user.isAdmin, // Only shown to admins
  action: () => {
    window.location.href = '/admin';
  },
});
```

### Brand Switching Commands

Use `BrandCommandsProvider` to automatically register a command per available brand:

```tsx
import { BrandCommandsProvider } from '@components/command-palette';

function Layout({ brands, selectedBrandId }: Props) {
  return <BrandCommandsProvider brands={brands} brandId={selectedBrandId} />;
}
```

The provider uses `useBrandCommands` and the `useBrandSwitchHandler` hook internally, keeps the current brand highlighted, and removes the commands when the component unmounts.

## Command Properties

```typescript
interface ICommand {
  id: string; // Unique identifier
  label: string; // Display name
  description?: string; // Optional description
  icon?: string; // Emoji or icon
  shortcut?: string[]; // Keyboard shortcut ['⌘', 'K']
  keywords?: string[]; // Search keywords
  category: CommandCategory; // Category for grouping
  action: () => void | Promise<void>; // Command action
  condition?: () => boolean; // Optional visibility condition
  priority?: number; // Search ranking (higher = better)
}
```

## Categories

- `navigation` - Navigation between pages
- `content` - Content management actions
- `generation` - AI generation commands
- `settings` - Settings and configuration
- `help` - Help and documentation
- `recent` - Recently used commands
- `search` - Search results
- `actions` - Quick actions

## Keyboard Shortcuts

| Shortcut        | Action                     |
| --------------- | -------------------------- |
| `⌘K` / `Ctrl+K` | Open/close command palette |
| `↑` / `↓`       | Navigate commands          |
| `Enter`         | Execute selected command   |
| `Escape`        | Close palette              |

## Default Commands

The system includes 25+ default commands:

### Navigation

- Go to Studio (`⌘1`)
- Go to Manager (`⌘2`)
- Go to Publisher (`⌘3`)
- Go to Analytics (`⌘4`)
- Go to Automation (`⌘5`)
- Go to Dashboard (`⌘H`)
- Go to Settings (`⌘,`)

### Generation

- Generate Video (`⌘⇧V`)
- Generate Image (`⌘⇧I`)
- Generate Caption (`⌘⇧C`)
- Generate Voice (`⌘⇧A`)

### Content

- Search Content (`⌘F`)
- Upload Files (`⌘U`)
- Create Folder (`⌘⇧N`)

### Help

- Documentation (`⌘?`)
- Contact Support
- Keyboard Shortcuts

## Examples

### Custom Navigation Command

```tsx
registerCommand({
  id: 'nav-my-page',
  label: 'Go to My Page',
  description: 'Navigate to my custom page',
  icon: '🚀',
  category: 'navigation',
  shortcut: ['⌘', '9'],
  keywords: ['my', 'custom', 'page'],
  priority: 10,
  action: () => {
    router.push('/my-page');
  },
});
```

### Async Command

```tsx
registerCommand({
  id: 'gen-report',
  label: 'Generate Report',
  icon: '📊',
  category: 'actions',
  action: async () => {
    const report = await generateReport();
    downloadReport(report);
  },
});
```

### Context-Dependent Command

```tsx
registerCommand({
  id: 'edit-selected',
  label: 'Edit Selected Items',
  category: 'actions',
  condition: () => selectedItems.length > 0,
  action: () => {
    editItems(selectedItems);
  },
});
```

## Styling

The component uses Tailwind CSS and can be customized via the `className` prop:

```tsx
<CommandPalette
  maxResults={15}
  placeholder="Search anything..."
  noResultsMessage="Nothing found. Try different keywords."
/>
```

## Performance

- Commands are indexed for fast search
- Fuzzy matching with intelligent scoring
- Only visible commands are rendered
- Recent commands cached in localStorage
- Efficient keyboard event handling

## Testing

```tsx
import { render, fireEvent, screen } from '@testing-library/react';
import { CommandPalette } from '@components/command-palette';
import { CommandPaletteProvider } from '@contexts/command-palette.context';

test('opens with keyboard shortcut', () => {
  render(
    <CommandPaletteProvider>
      <CommandPalette />
    </CommandPaletteProvider>,
  );

  fireEvent.keyDown(window, { key: 'k', metaKey: true });
  expect(screen.getByPlaceholderText(/command/i)).toBeInTheDocument();
});
```

## Best Practices

1. **Clear Labels**: Use descriptive, action-oriented labels
2. **Keywords**: Add synonyms and related terms for better search
3. **Categories**: Group related commands
4. **Priority**: Set higher priority for frequently used commands
5. **Conditions**: Hide irrelevant commands based on context
6. **Icons**: Use consistent emoji icons for visual recognition
7. **Cleanup**: Always unregister commands when components unmount

## Troubleshooting

### Commands not showing

- Check that commands are registered after provider is mounted
- Verify `condition` function (if any) returns true
- Check for typos in command IDs

### Keyboard shortcuts not working

- Ensure CommandPalette is rendered inside CommandPaletteProvider
- Check for conflicting keyboard shortcuts
- Verify browser doesn't override the shortcut

### Search not finding commands

- Add more keywords to commands
- Check label and description text
- Increase command priority

## Future Enhancements

- [ ] Command history with timestamps
- [ ] Command usage analytics
- [ ] Multi-step commands (wizards)
- [ ] Command aliases
- [ ] Plugin system for third-party commands
- [ ] Voice command support
- [ ] Command macros (chain multiple commands)
- [ ] Customizable themes
- [ ] Command groups and submenus
- [ ] Persistent custom commands per user

## License

MIT
