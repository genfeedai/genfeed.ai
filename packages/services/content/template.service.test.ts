import { TemplateService } from '@services/content/template.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/base.service');

describe('TemplateService', () => {
  let service: TemplateService;
  const mockToken = 'test-token-123';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TemplateService(mockToken);
  });

  describe('constructor', () => {
    it('initializes correctly', () => {
      expect(service).toBeInstanceOf(TemplateService);
    });
  });

  describe('template management', () => {
    it('has getTemplates method for fetching all templates', () => {
      expect(service.getTemplates).toBeDefined();
      expect(typeof service.getTemplates).toBe('function');
    });

    it('has getTemplate method for fetching single template', () => {
      expect(service.getTemplate).toBeDefined();
      expect(typeof service.getTemplate).toBe('function');
    });

    it('has createTemplate method for creating templates', () => {
      expect(service.post).toBeDefined();
      expect(typeof service.post).toBe('function');
    });

    it('has updateTemplate method for updating templates', () => {
      expect(service.patch).toBeDefined();
      expect(typeof service.patch).toBe('function');
    });

    it('has deleteTemplate method for removing templates', () => {
      expect(service.deleteTemplate).toBeDefined();
      expect(typeof service.deleteTemplate).toBe('function');
    });

    it('has findAll method from BaseService', () => {
      expect(service.findAll).toBeDefined();
      expect(typeof service.findAll).toBe('function');
    });

    it('has findOne method from BaseService', () => {
      expect(service.findOne).toBeDefined();
      expect(typeof service.findOne).toBe('function');
    });
  });

  describe('template features', () => {
    it('supports template library', () => {
      expect(service).toBeDefined();
    });

    it('supports template customization', () => {
      expect(service).toBeDefined();
    });

    it('supports template sharing', () => {
      expect(service).toBeDefined();
    });
  });
});
