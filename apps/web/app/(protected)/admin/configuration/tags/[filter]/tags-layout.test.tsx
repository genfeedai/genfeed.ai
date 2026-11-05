import { PageScope } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TagsLayout from './tags-layout';

describe('TagsLayout', () => {
  it('renders its content under the tag category tabs', () => {
    render(
      <TagsLayout scope={PageScope.SUPERADMIN}>
        <p>Tag list</p>
      </TagsLayout>,
    );

    expect(screen.getByText('Tag list')).toBeInTheDocument();
    expect(screen.getByText('Organization')).toBeInTheDocument();
  });
});
