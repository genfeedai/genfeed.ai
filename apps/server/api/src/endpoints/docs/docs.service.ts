import { Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

@Injectable()
export class DocsService {
  private openApiDocument: OpenAPIObject | Record<string, unknown> = {};
  private gptActionsSpec: Record<string, unknown> = {};

  setOpenApiDocument(doc: OpenAPIObject): void {
    this.openApiDocument = doc;
  }

  setGptActionsSpec(spec: Record<string, unknown>): void {
    this.gptActionsSpec = spec;
  }

  getOpenApiDocument(): OpenAPIObject | Record<string, unknown> {
    return this.openApiDocument;
  }

  getGptActionsSpec(): Record<string, unknown> {
    return this.gptActionsSpec;
  }
}
