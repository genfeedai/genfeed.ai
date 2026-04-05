# PromptBarContainer

A reusable positioning wrapper for prompt bars across the Genfeed application.

## Purpose

Provides consistent fixed bottom-center positioning with proper pointer-events handling for any prompt bar component. This allows you to use the same positioning pattern across different apps (studio, dashboard, analytics, etc.) while maintaining flexibility in the content.

## Features

- ✅ Fixed bottom-center positioning
- ✅ Responsive max-width container
- ✅ Proper pointer-events handling (allows interaction while preventing clicks on overlay)
- ✅ Customizable z-index
- ✅ Support for different max-widths
- ✅ Conditional rendering (isVisible prop)
- ✅ Clean, minimal API

## Usage

### Basic Example (Studio)

```tsx
import PromptBarContainer from '@ui/PromptBarContainer';
import PromptBar from '@components/prompt-bars/PromptBar';

function StudioPage() {
  return (
    <div className="flex h-screen flex-col">
      {/* Main content */}
      <div className="flex-1 overflow-auto">{/* Your content here */}</div>

      {/* Fixed prompt bar at bottom */}
      <PromptBarContainer>
        <PromptBar {...promptBarProps} />
      </PromptBarContainer>
    </div>
  );
}
```

### Custom Width

```tsx
// Wider container for more complex UIs
<PromptBarContainer maxWidth="6xl">
  <AdvancedPromptBar {...props} />
</PromptBarContainer>

// Narrower for simple search
<PromptBarContainer maxWidth="2xl">
  <SearchBar {...props} />
</PromptBarContainer>
```

### Custom Z-Index

```tsx
// Higher z-index to appear above modals
<PromptBarContainer zIndex={100}>
  <CommandPalette {...props} />
</PromptBarContainer>
```

### Conditional Rendering

```tsx
// Only show prompt bar on specific pages
<PromptBarContainer isVisible={showPromptBar}>
  <PromptBar {...props} />
</PromptBarContainer>
```

### Custom Styling

```tsx
// Add additional classes
<PromptBarContainer className="sm:hidden">
  <MobilePromptBar {...props} />
</PromptBarContainer>
```

## Props

| Prop        | Type                                                                                           | Default  | Description                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `children`  | `ReactNode`                                                                                    | required | Content to display (typically a PromptBar or custom bar component) |
| `className` | `string`                                                                                       | `''`     | Additional CSS classes for customization                           |
| `isVisible` | `boolean`                                                                                      | `true`   | Whether to show the container                                      |
| `zIndex`    | `number`                                                                                       | `10`     | z-index value for the fixed positioned container                   |
| `maxWidth`  | `'sm' \| 'md' \| 'lg' \| 'xl' \| '2xl' \| '3xl' \| '4xl' \| '5xl' \| '6xl' \| '7xl' \| 'full'` | `'4xl'`  | Maximum width of the centered container                            |

## Implementation Details

### Positioning

The component uses a two-layer approach:

1. **Outer layer**: `fixed bottom-0 left-0 right-0` with `pointer-events-none`
   - This creates the full-width overlay without blocking interactions

2. **Inner layer**: `max-w-{size} mx-auto px-6 pb-6` with `pointer-events-auto`
   - This centers the content and re-enables interactions for the prompt bar

### Styling Philosophy

The `PromptBarContainer` is **only responsible for positioning**. The children (like `PromptBar`) handle their own:

- Glassmorphic background styling
- Collapse/expand functionality
- Internal layout and spacing
- Border and shadow effects

This separation of concerns makes it easy to use different content types while maintaining consistent positioning.

## Use Cases

### 1. Content Creation (Current Studio Usage)

```tsx
<PromptBarContainer>
  <PromptBar
    models={videoModels}
    onSubmit={handleGenerate}
    categoryType={IngredientCategory.VIDEO}
  />
</PromptBarContainer>
```

### 2. Global Search (Future)

```tsx
<PromptBarContainer maxWidth="3xl">
  <GlobalSearchBar
    placeholder="Search across all content..."
    onSearch={handleSearch}
  />
</PromptBarContainer>
```

### 3. Command Palette (Future)

```tsx
<PromptBarContainer zIndex={100}>
  <CommandPalette commands={appCommands} onExecute={handleCommand} />
</PromptBarContainer>
```

### 4. Navigation (Future)

```tsx
<PromptBarContainer>
  <QuickNavigationBar recentPages={recentPages} onNavigate={handleNavigate} />
</PromptBarContainer>
```

## Migration from Manual Positioning

### Before:

```tsx
<div className="fixed bottom-0 left-0 right-0 z-10 pointer-events-none">
  <div className="max-w-4xl mx-auto px-6 pb-6 pointer-events-auto">
    <PromptBar {...props} />
  </div>
</div>
```

### After:

```tsx
<PromptBarContainer>
  <PromptBar {...props} />
</PromptBarContainer>
```

**Benefits:**

- ✅ Less boilerplate
- ✅ Consistent positioning across apps
- ✅ Easier to maintain
- ✅ Type-safe props

## Accessibility

- The container preserves all accessibility features of its children
- The `pointer-events` approach ensures keyboard navigation works correctly
- No focus traps are created by the positioning

## Performance

- Minimal overhead (just two wrapper divs)
- No state management
- No re-renders unless props change
- Children are not re-mounted on visibility toggle

## Browser Support

Works in all modern browsers that support:

- CSS `position: fixed`
- CSS `pointer-events`
- Flexbox

## Related Components

- **PromptBar** (`apps/studio/packages/components/prompt-bars/PromptBar.tsx`) - Main content creation prompt bar
- **PromptBarsVideoMerge** - Video merge prompt bar
- **PromptBarsImageMerge** - Image merge prompt bar

## Examples in Codebase

See: `apps/studio/packages/components/layouts/studio-generate-layout.tsx` (line 1664)

## Future Enhancements

Potential future features (not currently implemented):

- Multiple instances support with different positions (top, bottom, left, right)
- Animation options for show/hide
- Keyboard shortcut integration (e.g., ⌘K to focus)
- Mobile-specific positioning
- Responsive hiding on small screens

## Contributing

When modifying this component:

1. Keep it simple - it's just a positioning wrapper
2. Don't add collapse/styling logic here (belongs in children)
3. Update this documentation
4. Test with different children components
5. Verify pointer-events behavior

---

**Component Type:** Layout / Positioning  
**Created:** 2025-10-16  
**Last Updated:** 2025-10-16
