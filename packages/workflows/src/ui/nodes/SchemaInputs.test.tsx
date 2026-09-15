import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SchemaInputs } from './SchemaInputs';

const standardQuality = ['low', 'medium', 'high', 'auto'];
const qualitySchema = {
  quality: { allOf: [{ $ref: '#/components/schemas/quality' }] },
};

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
