/**
 * Templates Service
 * Prompt templates with {{variables}}: manage templates, fill variables, AI suggestions.
 * Backend: /templates API
 * NOTE: Different from Presets (saved PromptBar configurations).
 */

import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  ITemplateFilter,
  ITemplateGenerationRequest,
  ITemplateGenerationResult,
  ITemplateSuggestion,
  ITemplateUsage,
} from '@genfeedai/interfaces';
import type { IContentTemplate } from '@genfeedai/interfaces/content/template-ui.interface';
import { TemplateSerializer } from '@genfeedai/serializers';
import type { JsonApiResponseDocument } from '@helpers/data/json-api/json-api.helper';
import { Template } from '@models/content/template.model';
import { BaseService } from '@services/core/base.service';
import { logger } from '@services/core/logger.service';

export class TemplateService extends BaseService<IContentTemplate> {
  constructor(token: string) {
    super(API_ENDPOINTS.TEMPLATES, token, Template, TemplateSerializer);
  }

  public static getInstance(token: string): TemplateService {
    return BaseService.getDataServiceInstance(
      TemplateService,
      token,
    ) as TemplateService;
  }

  /**
   * Get all templates with optional filters
   * Replaces getTemplates() to follow standard BaseService.findAll() pattern
   */
  async getTemplates(filter?: ITemplateFilter): Promise<IContentTemplate[]> {
    try {
      const params: Record<string, unknown> = {};

      if (filter) {
        if (filter.category?.length) {
          params.category = filter.category.join(',');
        }

        // if (filter.industry?.length) {
        //   params.industry = filter.industry.join(',');
        // }

        // if (filter.type?.length) {
        //   params.type = filter.type.join(',');
        // }

        if (filter.difficulty?.length) {
          params.difficulty = filter.difficulty.join(',');
        }

        if (filter.isPremium !== undefined) {
          params.isPremium = filter.isPremium.toString();
        }

        if (filter.scope !== undefined) {
          params.scope = filter.scope.toString();
        }

        if (filter.search) {
          params.search = filter.search;
        }

        if (filter.minRating) {
          params.minRating = filter.minRating.toString();
        }

        if (filter.sortBy) {
          params.sortBy = filter.sortBy;
        }
      }

      return await this.findAll(params);
    } catch (error) {
      return this.handleOperationError('getTemplates', error);
    }
  }

  /**
   * Get template by ID
   * Uses standard BaseService.findOne()
   */
  async getTemplate(id: string): Promise<IContentTemplate> {
    try {
      return await this.findOne(id);
    } catch (error) {
      return this.handleOperationError('getTemplate', error);
    }
  }

  /**
   * Create new template
   * Uses standard BaseService.post()
   */
  async createTemplate(
    template: Partial<IContentTemplate>,
  ): Promise<IContentTemplate> {
    try {
      const response = await this.post('', template);
      logger.info('Template created', { templateId: response.id });
      return response;
    } catch (error) {
      return this.handleOperationError('createTemplate', error);
    }
  }

  /**
   * Update template
   * Uses standard BaseService.patch()
   */
  async updateTemplate(
    id: string,
    updates: Partial<IContentTemplate>,
  ): Promise<IContentTemplate> {
    try {
      const response = await this.patch(id, updates);
      logger.info('Template updated', { templateId: id });
      return response;
    } catch (error) {
      return this.handleOperationError('updateTemplate', error);
    }
  }

  /**
   * Delete template
   * Uses standard BaseService.delete()
   */
  async deleteTemplate(id: string): Promise<void> {
    try {
      await this.delete(id);
      logger.info('Template deleted', { templateId: id });
    } catch (error) {
      return this.handleOperationError('deleteTemplate', error);
    }
  }

  /**
   * Get AI-powered template suggestions based on user input
   */
  async getSuggestions(
    query: string,
    context?: Record<string, unknown>,
  ): Promise<ITemplateSuggestion[]> {
    try {
      return await this.instance
        .post('suggestions', { context, query })
        .then((res) => res.data)
        .then((data) => {
          logger.info('Template suggestions retrieved', {
            count: data?.length || 0,
            query,
          });
          return data || [];
        });
    } catch (error) {
      return this.handleOperationError('getSuggestions', error);
    }
  }

  /**
   * Generate content from template
   */
  async generateFromTemplate(
    request: ITemplateGenerationRequest,
  ): Promise<ITemplateGenerationResult> {
    try {
      return await this.instance
        .post<ITemplateGenerationResult>('generate', request)
        .then((res) => res.data!)
        .then((data) => {
          logger.info('Content generated from template', {
            resultId: data?.id,
            templateId: request.template,
          });
          return data;
        });
    } catch (error) {
      return this.handleOperationError('generateFromTemplate', error);
    }
  }

  /**
   * Track template usage
   */
  async trackUsage(usage: Partial<ITemplateUsage>): Promise<ITemplateUsage> {
    try {
      return await this.instance
        .post<ITemplateUsage>('usage', usage)
        .then((res) => res.data!);
    } catch (error) {
      return this.handleOperationError('trackUsage', error);
    }
  }

  /**
   * Get template usage analytics
   */
  async getTemplateAnalytics(templateId: string): Promise<{
    totalUsage: number;
    avgPerformance: Record<string, number>;
    topVariables: Record<string, unknown>[];
    successRate: number;
  }> {
    try {
      return await this.instance
        .get(`/${templateId}/analytics`)
        .then((res) => res.data);
    } catch (error) {
      return this.handleOperationError('getTemplateAnalytics', error);
    }
  }

  /**
   * Duplicate template
   */
  async duplicateTemplate(
    id: string,
    customizations?: Partial<IContentTemplate>,
  ): Promise<IContentTemplate> {
    try {
      const response = await this.post(
        `/${id}/duplicate`,
        customizations ?? {},
      );
      logger.info('Template duplicated', {
        newId: response.id,
        originalId: id,
      });
      return response;
    } catch (error) {
      return this.handleOperationError('duplicateTemplate', error);
    }
  }

  /**
   * Get popular templates
   */
  async getPopularTemplates(limit = 10): Promise<IContentTemplate[]> {
    try {
      return await this.instance
        .get<JsonApiResponseDocument>(`popular?limit=${limit}`)
        .then((res) => res.data)
        .then((data) => this.mapMany(data));
    } catch (error) {
      return this.handleOperationError('getPopularTemplates', error);
    }
  }

  /**
   * Get recommended templates for user
   */
  async getRecommended(limit = 10): Promise<IContentTemplate[]> {
    try {
      return await this.instance
        .get<JsonApiResponseDocument>(`recommended?limit=${limit}`)
        .then((res) => res.data)
        .then((data) => this.mapMany(data));
    } catch (error) {
      return this.handleOperationError('getRecommended', error);
    }
  }

  /**
   * Search templates
   */
  async searchTemplates(query: string): Promise<IContentTemplate[]> {
    try {
      return await this.instance
        .get<JsonApiResponseDocument>(`search?q=${encodeURIComponent(query)}`)
        .then((res) => res.data)
        .then((data) => this.mapMany(data));
    } catch (error) {
      return this.handleOperationError('searchTemplates', error);
    }
  }
}
