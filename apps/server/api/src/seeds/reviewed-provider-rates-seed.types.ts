import type { Prisma } from '@genfeedai/prisma';

/** OpenAPI-shaped JSON document whose Input and Output schemas the seed ships. */
export interface SchemaFixtureOpenapi extends Prisma.InputJsonObject {
  components: {
    schemas: {
      Input: Prisma.InputJsonObject;
      Output: Prisma.InputJsonObject;
    };
  };
  openapi: string;
}

/** Schemas shipped for a rate-sheet row that has none observed from its provider. */
export interface SchemaFixture {
  openapi: SchemaFixtureOpenapi;
  schemaFamily: string;
}
