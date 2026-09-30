import {
  WorkflowExecutionStatus,
  WorkflowLifecycle,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  formatLifecycleLabel,
  getLifecycleBadgeClass,
  getStatusBorderColor,
  getStatusColor,
  getStatusIcon,
  isNonDefaultWorkflowLifecycle,
} from '@/features/workflows/utils/status-helpers';

describe('getStatusIcon', () => {
  it('completed', () =>
    expect(getStatusIcon(WorkflowExecutionStatus.COMPLETED)).toBe('✅'));
  it('failed', () =>
    expect(getStatusIcon(WorkflowExecutionStatus.FAILED)).toBe('❌'));
  it('running', () =>
    expect(getStatusIcon(WorkflowExecutionStatus.RUNNING)).toBe('⏳'));
  it('cancelled', () =>
    expect(getStatusIcon(WorkflowExecutionStatus.CANCELLED)).toBe('🚫'));
  it('default', () =>
    expect(getStatusIcon(WorkflowExecutionStatus.PENDING)).toBe('⏸️'));
});

describe('getStatusColor', () => {
  it('completed', () =>
    expect(getStatusColor(WorkflowExecutionStatus.COMPLETED)).toContain(
      'text-success',
    ));
  it('failed', () =>
    expect(getStatusColor(WorkflowExecutionStatus.FAILED)).toContain(
      'text-destructive',
    ));
  it('running', () =>
    expect(getStatusColor(WorkflowExecutionStatus.RUNNING)).toContain(
      'text-warning',
    ));
  it('cancelled', () =>
    expect(getStatusColor(WorkflowExecutionStatus.CANCELLED)).toContain(
      'text-muted-foreground',
    ));
  it('default', () =>
    expect(getStatusColor(WorkflowExecutionStatus.PENDING)).toContain('muted'));
});

describe('getStatusBorderColor', () => {
  it('completed', () =>
    expect(getStatusBorderColor(WorkflowExecutionStatus.COMPLETED)).toContain(
      'border-success',
    ));
  it('failed', () =>
    expect(getStatusBorderColor(WorkflowExecutionStatus.FAILED)).toContain(
      'border-destructive',
    ));
  it('running', () =>
    expect(getStatusBorderColor(WorkflowExecutionStatus.RUNNING)).toContain(
      'border-warning',
    ));
  it('cancelled', () =>
    expect(getStatusBorderColor(WorkflowExecutionStatus.CANCELLED)).toContain(
      'border-border',
    ));
  it('default', () =>
    expect(getStatusBorderColor(WorkflowExecutionStatus.PENDING)).toContain(
      'border',
    ));
});

describe('getLifecycleBadgeClass', () => {
  it('published', () =>
    expect(getLifecycleBadgeClass(WorkflowLifecycle.PUBLISHED)).toContain(
      'success',
    ));
  it('archived', () =>
    expect(getLifecycleBadgeClass(WorkflowLifecycle.ARCHIVED)).toBe(
      'border border-border bg-foreground/[0.04] text-foreground/55',
    ));
  it('draft/default', () =>
    expect(getLifecycleBadgeClass(WorkflowLifecycle.DRAFT)).toContain(
      'warning',
    ));
  it('undefined', () =>
    expect(getLifecycleBadgeClass(undefined)).toContain('warning'));
});

describe('formatLifecycleLabel', () => {
  it('published', () =>
    expect(formatLifecycleLabel(WorkflowLifecycle.PUBLISHED)).toBe(
      'Published',
    ));
  it('archived', () =>
    expect(formatLifecycleLabel(WorkflowLifecycle.ARCHIVED)).toBe('Archived'));
  it('draft/default', () =>
    expect(formatLifecycleLabel(WorkflowLifecycle.DRAFT)).toBe('Draft'));
});

describe('isNonDefaultWorkflowLifecycle', () => {
  it('hides draft', () => {
    expect(isNonDefaultWorkflowLifecycle(WorkflowLifecycle.DRAFT)).toBe(false);
    expect(isNonDefaultWorkflowLifecycle(undefined)).toBe(false);
  });

  it('keeps published and archived', () => {
    expect(isNonDefaultWorkflowLifecycle(WorkflowLifecycle.PUBLISHED)).toBe(
      true,
    );
    expect(isNonDefaultWorkflowLifecycle(WorkflowLifecycle.ARCHIVED)).toBe(
      true,
    );
  });
});
