import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import agentMessages from '../../../../apps/app/messages/en/agent.json';
import { SafeMarkdown } from './SafeMarkdown';

vi.unmock('next-intl');

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

    render(
      <NextIntlClientProvider locale="en" messages={{ agent: agentMessages }}>
        <SafeMarkdown content={markdown} />
      </NextIntlClientProvider>,
    );

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

  it('copies a code block to the clipboard from its copy button', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <NextIntlClientProvider locale="en" messages={{ agent: agentMessages }}>
        <SafeMarkdown content={['```ts', 'const x = 1;', '```'].join('\n')} />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy code block' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('const x = 1;\n');
    });
  });

  it('renders host-provided copy labels without an intl provider', () => {
    render(
      <SafeMarkdown
        content={'```ts\nconst x = 1;\n```'}
        codeBlockLabels={{
          copied: 'Copié',
          copy: 'Copier',
          copyAria: 'Copier le bloc',
        }}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Copier le bloc' }),
    ).toBeInTheDocument();
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

  it('enhances plain capability lines when enhanceStructure is on', () => {
    const content = [
      'Generation: Create images and videos.',
      'Scheduling: Plan posts ahead of time.',
    ].join('\n');

    render(<SafeMarkdown content={content} enhanceStructure />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Generation:')).toBeInTheDocument();
  });

  it('keeps multi-paragraph ordered items in one list with sequential numbers', () => {
    const content = [
      '1. **One-second impact**',
      ' Most visuals lose before the caption gets a chance.',
      '',
      ' The fix is brutal.',
      '',
      '2. **Visuals as the hook**',
      ' A good image is not decoration.',
    ].join('\n');

    const { container } = render(
      <SafeMarkdown content={content} enhanceStructure />,
    );

    // One ordered list — not two separate lists each restarting at 1.
    expect(container.querySelectorAll('ol')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText(/One-second impact/)).toBeInTheDocument();
    expect(screen.getByText(/Visuals as the hook/)).toBeInTheDocument();
  });
});
