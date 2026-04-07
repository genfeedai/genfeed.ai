# Dropdown Components

Inline editing dropdowns for tables and lists.

## DropdownStatus

Inline status editing for articles, ingredients, and posts.

**Status Options:**

- Articles: Draft, Published, Archived
- Ingredients: Completed, Validated, Archived, Rejected, Failed
- Posts: Draft, Scheduled, Public, Private, Unlisted (editable only)

```tsx
<DropdownStatus
  entity={article}
  onStatusChange={(newStatus, updatedItem) => {
    if (updatedItem) {
      mutate(items.map((i) => (i.id === item.id ? updatedItem : i)));
    }
  }}
/>
```

## DropdownScope

Inline scope editing for articles and ingredients.

**Scope Options:**

- Private
- Brand
- Organization
- Public

```tsx
<DropdownScope
  item={article}
  onScopeChange={(newScope, updatedItem) => {
    if (updatedItem) {
      mutate(items.map((i) => (i.id === item.id ? updatedItem : i)));
    }
  }}
/>
```

## Table Usage

```tsx
const columns = [
  {
    key: 'status',
    header: 'Status',
    className: 'w-40',
    render: (item) => (
      <DropdownStatus
        entity={item}
        onStatusChange={(newStatus, updatedItem) => {
          if (updatedItem) {
            mutate(items.map((i) => (i.id === item.id ? updatedItem : i)));
          }
        }}
      />
    ),
  },
  {
    key: 'scope',
    header: 'Scope',
    className: 'w-40',
    render: (item) => (
      <DropdownScope
        item={item}
        onScopeChange={(newScope, updatedItem) => {
          if (updatedItem) {
            mutate(items.map((i) => (i.id === item.id ? updatedItem : i)));
          }
        }}
      />
    ),
  },
];
```
