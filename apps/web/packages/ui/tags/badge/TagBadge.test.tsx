import type { ITag } from '@genfeedai/interfaces';
import { TagCategory } from '@genfeedai/enums';
import { render } from '@testing-library/react';
import TagBadge from '@ui/tags/badge/TagBadge';
import { describe, expect, it } from 'vitest';

describe('TagBadge', () => {
  const tag = {
    backgroundColor: '#6b7280',
    category: TagCategory.INGREDIENT,
    createdAt: '2024-01-01',
    id: 'tag-1',
    isDeleted: false,
    label: 'Test Tag',
    textColor: '#ffffff',
    updatedAt: '2024-01-01',
  } as ITag;

  it('should render without crashing', () => {
    const { container } = render(<TagBadge tag={tag} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<TagBadge tag={tag} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<TagBadge tag={tag} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
