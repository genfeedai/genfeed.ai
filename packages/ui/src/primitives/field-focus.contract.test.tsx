// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { Input } from '@ui/primitives/input';
import Searchbar from '@ui/primitives/searchbar';
import { Textarea } from '@ui/primitives/textarea';
import { describe, expect, it } from 'vitest';

const RING_CLASS_PATTERN = /(?:^|\s)(?:focus|focus-visible|focus-within):ring/u;

describe('text field focus', () => {
  it.each([
    ['Input', <Input aria-label="Field" key="input" />],
    ['Textarea', <Textarea aria-label="Field" key="textarea" />],
    ['Searchbar', <Searchbar ariaLabel="Field" key="search" />],
  ])('%s marks focus with its border and draws no ring', (_name, field) => {
    render(field);

    const className = screen.getByRole('textbox', { name: 'Field' }).className;

    expect(className).toContain('focus-visible:border-foreground/50');
    expect(className).not.toMatch(RING_CLASS_PATTERN);
  });
});
