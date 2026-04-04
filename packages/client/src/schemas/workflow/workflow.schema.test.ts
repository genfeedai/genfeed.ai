import { editFormSchema } from '@genfeedai/client/schemas/workflow/edit.schema';
import {
  exportFields,
  exportSchema,
} from '@genfeedai/client/schemas/workflow/export.schema';
import {
  trainingEditSchema,
  trainingSchema,
} from '@genfeedai/client/schemas/workflow/training.schema';
import { ModelKey } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

describe('workflow schemas', () => {
  describe('trainingSchema', () => {
    it('accepts valid', () => {
      expect(
        trainingSchema.safeParse({
          category: 'subject',
          label: 'Model',
          steps: 2000,
          trigger: 'TOK',
        }).success,
      ).toBe(true);
    });

    it('rejects steps < 1000', () => {
      expect(
        trainingSchema.safeParse({
          category: 'subject',
          label: 'M',
          steps: 500,
          trigger: 'T',
        }).success,
      ).toBe(false);
    });

    it('rejects steps > 5000', () => {
      expect(
        trainingSchema.safeParse({
          category: 'subject',
          label: 'M',
          steps: 6000,
          trigger: 'T',
        }).success,
      ).toBe(false);
    });

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
    it('accepts valid', () => {
      expect(trainingEditSchema.safeParse({ label: 'Name' }).success).toBe(
        true,
      );
    });

    it('rejects empty label', () => {
      expect(trainingEditSchema.safeParse({ label: '' }).success).toBe(false);
    });
  });

  describe('exportSchema', () => {
    it('accepts valid', () => {
      expect(
        exportSchema.safeParse({ fields: ['id', 'title'], format: 'csv' })
          .success,
      ).toBe(true);
    });

    it('rejects empty fields', () => {
      expect(
        exportSchema.safeParse({ fields: [], format: 'csv' }).success,
      ).toBe(false);
    });

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

    it('rejects empty text for non-upscale model', () => {
      expect(
        editFormSchema.safeParse({ model: 'some-model', text: '' }).success,
      ).toBe(false);
    });

    it('accepts empty text for upscale model', () => {
      expect(
        editFormSchema.safeParse({
          model: ModelKey.REPLICATE_TOPAZ_IMAGE_UPSCALE,
          text: '',
        }).success,
      ).toBe(true);
    });

    it('rejects empty model', () => {
      expect(
        editFormSchema.safeParse({ model: '', text: 'text' }).success,
      ).toBe(false);
    });
  });
});
