import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('should merge class names', () => {
    const result = cn('foo', 'bar');
    expect(result).toBe('foo bar');
  });

  it('should handle conditional classes', () => {
    const isActive = true;
    const result = cn('base', isActive && 'active');
    expect(result).toBe('base active');
  });

  it('should handle false conditionals', () => {
    const isActive = false;
    const result = cn('base', isActive && 'active');
    expect(result).toBe('base');
  });

  it('should handle undefined values', () => {
    const result = cn('base', undefined, 'end');
    expect(result).toBe('base end');
  });

  it('should handle null values', () => {
    const result = cn('base', null, 'end');
    expect(result).toBe('base end');
  });

  it('should merge Tailwind classes correctly', () => {
    // twMerge should handle conflicting Tailwind classes
    const result = cn('p-4', 'p-8');
    expect(result).toBe('p-8');
  });

  it('should merge background colors correctly', () => {
    const result = cn('bg-red-500', 'bg-blue-500');
    expect(result).toBe('bg-blue-500');
  });

  it('should preserve non-conflicting classes', () => {
    const result = cn('p-4', 'm-2', 'bg-red-500');
    expect(result).toBe('p-4 m-2 bg-red-500');
  });

  it('should handle array input', () => {
    const result = cn(['foo', 'bar']);
    expect(result).toBe('foo bar');
  });

  it('should handle object input', () => {
    const result = cn({ bar: false, baz: true, foo: true });
    expect(result).toBe('baz foo');
  });

  it('should handle mixed input types', () => {
    const result = cn('base', ['array-class'], { 'object-class': true });
    expect(result).toBe('base array-class object-class');
  });

  it('should handle empty input', () => {
    const result = cn();
    expect(result).toBe('');
  });

  it('should handle responsive Tailwind classes', () => {
    const result = cn('md:p-4', 'lg:p-8');
    expect(result).toBe('md:p-4 lg:p-8');
  });

  it('should merge responsive variants of same property', () => {
    const result = cn('md:p-4', 'md:p-8');
    expect(result).toBe('md:p-8');
  });

  it('should handle hover and focus states', () => {
    const result = cn('hover:bg-red-500', 'focus:bg-blue-500');
    expect(result).toBe('hover:bg-red-500 focus:bg-blue-500');
  });

  it('should merge hover states of same property', () => {
    const result = cn('hover:bg-red-500', 'hover:bg-blue-500');
    expect(result).toBe('hover:bg-blue-500');
  });

  it('should handle complex component class merging', () => {
    const baseClasses = 'px-4 py-2 rounded-md bg-gray-100';
    const variantClasses = 'bg-blue-500 text-white';
    const result = cn(baseClasses, variantClasses);
    expect(result).toBe('px-4 py-2 rounded-md bg-blue-500 text-white');
  });
});
