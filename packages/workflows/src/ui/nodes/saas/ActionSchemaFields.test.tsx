import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionSchemaFields } from './ActionSchemaFields';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    count: { type: 'integer', title: 'Count' },
    enabled: { type: 'boolean', title: 'Enabled' },
    prompt: { type: 'string', title: 'Prompt' },
    mode: { type: 'string', title: 'Mode', enum: ['draft', 'live'] },
    settings: { type: 'object', title: 'Settings' },
  },
};

describe('ActionSchemaFields with shared controls', () => {
  it('preserves text, numeric, checkbox and textarea changes', () => {
    const onChange = vi.fn();
    render(
      <ActionSchemaFields
        schema={schema}
        values={{ name: 'Draft', count: 2, enabled: false, prompt: 'Hello' }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Published' },
    });
    fireEvent.change(screen.getByLabelText('Count'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enabled' }));
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'New prompt' },
    });
    expect(onChange.mock.calls).toEqual([
      ['name', 'Published'],
      ['count', 3],
      ['enabled', true],
      ['prompt', 'New prompt'],
    ]);
  });

  it('keeps all controls disabled while an action is locked', () => {
    render(
      <ActionSchemaFields
        disabled
        schema={schema}
        values={{}}
        onChange={vi.fn()}
      />,
    );
    for (const name of [
      'Name',
      'Count',
      'Enabled',
      'Prompt',
      'Mode',
      'Settings',
    ]) {
      expect(screen.getByLabelText(name)).toBeDisabled();
    }
  });

  it('keeps JSON drafts until blur and rejects malformed JSON', () => {
    const onChange = vi.fn();
    render(
      <ActionSchemaFields
        schema={schema}
        values={{ settings: { retries: 1 } }}
        onChange={onChange}
      />,
    );
    const settings = screen.getByLabelText('Settings');
    fireEvent.change(settings, { target: { value: '{"retries":2}' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(settings);
    expect(onChange).toHaveBeenCalledWith('settings', { retries: 2 });
    onChange.mockClear();
    fireEvent.change(settings, { target: { value: '{' } });
    fireEvent.blur(settings);
    expect(onChange).not.toHaveBeenCalled();
    expect(settings).toHaveAttribute('aria-invalid', 'true');
  });

  it('opens the shared select by keyboard and commits the selected value', () => {
    const onChange = vi.fn();
    render(
      <ActionSchemaFields
        schema={schema}
        values={{ mode: 'draft' }}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Mode' }), {
      key: 'ArrowDown',
    });
    const live = screen.getByRole('option', { name: 'live' });
    fireEvent.keyDown(live, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('mode', 'live');
  });
});
