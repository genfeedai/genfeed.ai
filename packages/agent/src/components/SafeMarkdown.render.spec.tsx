import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown';

describe('SafeMarkdown rendering', () => {
  it('renders headings, lists, emphasis, and code from markdown', () => {
    const markdown = [
      '# Heading one',
      '## Heading two',
      '### Heading three',
      '',
      'A paragraph with **bold** text and `inline` code.',
      '',
      '- first item',
      '- second item',
      '',
      '1. ordered one',
      '2. ordered two',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');

    render(<SafeMarkdown content={markdown} />);

    expect(
      screen.getByRole('heading', { level: 3, name: 'Heading one' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Heading two' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 4, name: 'Heading three' }),
    ).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('inline')).toBeInTheDocument();
    expect(screen.getByText('first item')).toBeInTheDocument();
    expect(screen.getByText('ordered two')).toBeInTheDocument();
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  it('renders safe links with a hardened rel and strips unsafe hrefs', () => {
    render(
      <SafeMarkdown
        content={
          '[safe](https://example.com) and [unsafe](javascript:alert(1))'
        }
      />,
    );

    const link = screen.getByRole('link', { name: 'safe' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    // Unsafe href renders as plain text, not a link.
    expect(screen.queryByRole('link', { name: 'unsafe' })).toBeNull();
    expect(screen.getByText('unsafe')).toBeInTheDocument();
  });

  it('renders mailto links as safe', () => {
    render(<SafeMarkdown content={'[mail](mailto:hi@example.com)'} />);

    expect(screen.getByRole('link', { name: 'mail' })).toHaveAttribute(
      'href',
      'mailto:hi@example.com',
    );
  });

  it('skips raw HTML in the content', () => {
    render(<SafeMarkdown content={'before <script>alert(1)</script> after'} />);

    expect(document.querySelector('script')).toBeNull();
  });

  it('enhances plain capability lines when enhanceStructure is on', () => {
    const content = [
      'Generation: Create images and videos.',
      'Scheduling: Plan posts ahead of time.',
    ].join('\n');

    render(<SafeMarkdown content={content} enhanceStructure />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Generation:')).toBeInTheDocument();
  });
});
