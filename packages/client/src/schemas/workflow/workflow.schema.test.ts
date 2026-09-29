import { editFormSchema } from '@genfeedai/client/schemas/workflow/edit.schema';
import {
  exportFields,
  exportSchema,
} from '@genfeedai/client/schemas/workflow/export.schema';
import {
  trainingEditSchema,
  trainingSchema,
} from '@genfeedai/client/schemas/workflow/training.schema';
import { describe, expect, it } from 'vitest';

describe('workflow schemas', () => {
  describe('trainingSchema', () => {
    it('rejects invalid category', () => {
      expect(
        trainingSchema.safeParse({
          category: 'bad',
          label: 'M',
          steps: 2000,
          trigger: 'T',
        }).success,
      ).toBe(false);
    });
  });

  describe('trainingEditSchema', () => {
    it('rejects empty label', () => {
      expect(trainingEditSchema.safeParse({ label: '' }).success).toBe(false);
    });
  });

  describe('exportSchema', () => {
    it('rejects invalid format', () => {
      expect(
        exportSchema.safeParse({ fields: ['id'], format: 'pdf' }).success,
      ).toBe(false);
    });

    it('exportFields has expected entries', () => {
      expect(exportFields).toContain('id');
      expect(exportFields).toContain('title');
      expect(exportFields).toContain('status');
    });
  });

  describe('editFormSchema', () => {
    it('accepts valid with text', () => {
      expect(
        editFormSchema.safeParse({ model: 'some-model', text: 'Enhance' })
          .success,
      ).toBe(true);
    });
  });
});
