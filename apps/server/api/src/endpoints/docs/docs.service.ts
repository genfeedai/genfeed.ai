import { Injectable } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

@Injectable()
export class DocsService {
  private openApiDocument: OpenAPIObject | Record<string, unknown> | null =
    null;
  private openApiDocumentFactory: (() => OpenAPIObject) | null = null;
  private gptActionsSpec: Record<string, unknown> = {};

  setOpenApiDocument(doc: OpenAPIObject): void {
    this.openApiDocument = doc;
    this.openApiDocumentFactory = null;
  }

  setOpenApiDocumentFactory(factory: () => OpenAPIObject): void {
    this.openApiDocument = null;
    this.openApiDocumentFactory = factory;
  }

  setGptActionsSpec(spec: Record<string, unknown>): void {
    this.gptActionsSpec = spec;
  }

  getOpenApiDocument(): OpenAPIObject | Record<string, unknown> {
    if (this.openApiDocument) {
      return this.openApiDocument;
    }

    if (this.openApiDocumentFactory) {
      this.openApiDocument = this.openApiDocumentFactory();
      return this.openApiDocument;
    }

    return {};
  }

  getGptActionsSpec(): Record<string, unknown> {
    return this.gptActionsSpec;
  }
}
