import { fireEvent, render, screen } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaInputs } from './SchemaInputs';

const standardQuality = ['low', 'medium', 'high', 'auto'];
const qualitySchema = {
  quality: { allOf: [{ $ref: '#/components/schemas/quality' }] },
};
const durationSchema = {
  duration: { allOf: [{ $ref: '#/components/schemas/duration' }] },
};

/**
 * Mirrors the node hook: every change is written back into the persisted
 * values the inputs render from, so a repaired value reaches the trigger.
 */
function PersistedInputs({
  values: initialValues,
  ...props
}: Omit<ComponentProps<typeof SchemaInputs>, 'onChange'>) {
  const [values, setValues] = useState(initialValues);
  return (
    <SchemaInputs
      {...props}
      values={values}
      onChange={(key, value) =>
        setValues((current) => ({ ...current, [key]: value }))
      }
    />
  );
}

function renderInputs(
  props: Partial<ComponentProps<typeof SchemaInputs>> = {},
) {
  return render(
    <SchemaInputs
      schema={qualitySchema}
      values={{}}
      onChange={vi.fn()}
      {...props}
    />,
  );
}

function openOptions() {
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
  return screen.getAllByRole('option').map((option) => option.textContent);
}

describe('SchemaInputs model enums', () => {
  it.each(['GPT Image 1.5', 'GPT Image 2'])(
    '%s uses explicit model quality options',
    () => {
      renderInputs({ enumValues: { quality: standardQuality } });
      expect(openOptions()).toEqual(standardQuality);
    },
  );

  it.each(['GPT Image 1.5', 'GPT Image 2'])(
    '%s uses referenced component quality options',
    () => {
      renderInputs({
        componentSchemas: {
          quality: { enum: standardQuality, type: 'string' },
        },
      });
      expect(openOptions()).toEqual(standardQuality);
    },
  );

  it.each([
    ['low', 'medium', 'high', 'xhigh', 'max', 'auto'],
    ['draft', 'production'],
  ])('preserves the declared options %j', (...options) => {
    renderInputs({ componentSchemas: { quality: { enum: options } } });
    expect(openOptions()).toEqual(options);
  });

  it('prefers explicit overrides over component and direct enums', () => {
    renderInputs({
      componentSchemas: { quality: { enum: ['component'] } },
      enumValues: { quality: ['override'] },
      schema: { quality: { ...qualitySchema.quality, enum: ['direct'] } },
    });
    expect(openOptions()).toEqual(['override']);
  });

  it('prefers a referenced component enum over a direct enum', () => {
    renderInputs({
      componentSchemas: { quality: { enum: ['component'] } },
      schema: { quality: { ...qualitySchema.quality, enum: ['direct'] } },
    });
    expect(openOptions()).toEqual(['component']);
  });

  it.each([true, false])(
    'uses direct enums with a reference: %s',
    (hasReference) => {
      renderInputs({
        schema: {
          quality: {
            ...(hasReference ? qualitySchema.quality : {}),
            enum: standardQuality,
          },
        },
      });
      expect(openOptions()).toEqual(standardQuality);
    },
  );

  it.each([
    {},
    {
      enumValues: { quality: [] },
      componentSchemas: { quality: { enum: standardQuality } },
    },
    { componentSchemas: { quality: { enum: [] } } },
    { schema: { quality: { enum: [] } } },
    {
      enumValues: { quality: [] },
      schema: { quality: { ...qualitySchema.quality, enum: standardQuality } },
    },
    {
      componentSchemas: { quality: { enum: [] } },
      schema: { quality: { ...qualitySchema.quality, enum: standardQuality } },
    },
    { schema: { quality: { type: 'string' } } },
  ])('omits quality without a nonempty declared enum: %j', (props) => {
    renderInputs(props);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('emits the original quality value when selected', () => {
    const onChange = vi.fn();
    renderInputs({ enumValues: { quality: standardQuality }, onChange });
    openOptions();
    fireEvent.click(screen.getByRole('option', { name: 'high' }));
    expect(onChange).toHaveBeenCalledWith('quality', 'high');
  });

  it('updates options when the selected model schema changes', () => {
    const onChange = vi.fn();
    const { rerender } = renderInputs({
      schema: { quality: { enum: standardQuality } },
      onChange,
    });
    rerender(
      <SchemaInputs
        schema={{ quality: { enum: ['draft', 'final'] } }}
        values={{}}
        onChange={onChange}
      />,
    );
    expect(openOptions()).toEqual(['draft', 'final']);
  });

  it.each([
    { enum: [4, 8], expected: 8, type: 'integer' },
    { enum: [0.25, 1.5], expected: 1.5, type: 'number' },
  ])('coerces referenced $type options to numbers', (component) => {
    const onChange = vi.fn();
    renderInputs({
      componentSchemas: { duration: component },
      onChange,
      schema: {
        duration: { allOf: [{ $ref: '#/components/schemas/duration' }] },
      },
    });
    expect(openOptions()).toEqual(component.enum.map(String));
    fireEvent.click(
      screen.getByRole('option', { name: String(component.expected) }),
    );
    expect(onChange).toHaveBeenCalledWith('duration', component.expected);
  });

  it('preserves unrelated enum fallbacks', () => {
    renderInputs({
      schema: { mode: { allOf: [{ $ref: '#/components/schemas/mode' }] } },
    });
    expect(openOptions()).toEqual(['std', 'pro']);
  });
});

describe('SchemaInputs stale persisted enum values', () => {
  it.each(['xhigh', 'max'])(
    'repairs a stored %s quality to the model default for GPT Image 1.5/2',
    (stale) => {
      const onChange = vi.fn();
      renderInputs({
        enumValues: { quality: standardQuality },
        onChange,
        schema: { quality: { ...qualitySchema.quality, default: 'auto' } },
        values: { quality: stale },
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('quality', 'auto');
    },
  );

  it('falls back to the first declared option when the model has no default', () => {
    const onChange = vi.fn();
    renderInputs({
      componentSchemas: { quality: { enum: standardQuality, type: 'string' } },
      onChange,
      values: { quality: 'xhigh' },
    });
    expect(onChange).toHaveBeenCalledWith('quality', 'low');
  });

  it('ignores a model default the model no longer offers', () => {
    const onChange = vi.fn();
    renderInputs({
      enumValues: { quality: standardQuality },
      onChange,
      schema: { quality: { ...qualitySchema.quality, default: 'max' } },
      values: { quality: 'xhigh' },
    });
    expect(onChange).toHaveBeenCalledWith('quality', 'low');
  });

  it('repairs a stored direct enum value without a reference', () => {
    const onChange = vi.fn();
    renderInputs({
      onChange,
      schema: { quality: { default: 'auto', enum: standardQuality } },
      values: { quality: 'xhigh' },
    });
    expect(onChange).toHaveBeenCalledWith('quality', 'auto');
  });

  it('renders the repaired value once it is written back', () => {
    render(
      <PersistedInputs
        enumValues={{ quality: standardQuality }}
        schema={{ quality: { ...qualitySchema.quality, default: 'auto' } }}
        values={{ quality: 'xhigh' }}
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('auto');
    expect(openOptions()).toEqual(standardQuality);
  });

  it.each([
    ['high', standardQuality],
    ['xhigh', ['low', 'medium', 'high', 'xhigh', 'max', 'auto']],
  ])(
    'keeps a stored %s quality the model still declares',
    (stored, options) => {
      const onChange = vi.fn();
      renderInputs({
        enumValues: { quality: options },
        onChange,
        values: { quality: stored },
      });
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('leaves an unset quality alone', () => {
    const onChange = vi.fn();
    renderInputs({ enumValues: { quality: standardQuality }, onChange });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('never judges a stored value against the generic fallback list', () => {
    const onChange = vi.fn();
    renderInputs({
      onChange,
      schema: { mode: { allOf: [{ $ref: '#/components/schemas/mode' }] } },
      values: { mode: 'custom' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts a stored number that a direct numeric enum declares', () => {
    const onChange = vi.fn();
    renderInputs({
      onChange,
      schema: { steps: { default: 10, enum: [10, 20], type: 'integer' } },
      values: { steps: 20 },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('repairs a stale direct numeric option back as a number', () => {
    const onChange = vi.fn();
    renderInputs({
      onChange,
      schema: { steps: { default: 10, enum: [10, 20], type: 'integer' } },
      values: { steps: 30 },
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('steps', 10);
  });

  it('writes a repaired referenced numeric option back as a number', () => {
    const onChange = vi.fn();
    renderInputs({
      componentSchemas: { duration: { enum: [4, 8], type: 'integer' } },
      onChange,
      schema: { duration: { ...durationSchema.duration, default: 8 } },
      values: { duration: 6 },
    });
    expect(onChange).toHaveBeenCalledWith('duration', 8);
  });

  it('repairs a stale quality when the selected model schema changes', () => {
    const onChange = vi.fn();
    const extended = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'];
    const { rerender } = renderInputs({
      enumValues: { quality: extended },
      onChange,
      values: { quality: 'xhigh' },
    });
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <SchemaInputs
        enumValues={{ quality: standardQuality }}
        onChange={onChange}
        schema={qualitySchema}
        values={{ quality: 'xhigh' }}
      />,
    );
    expect(onChange).toHaveBeenCalledWith('quality', 'low');
  });
});
