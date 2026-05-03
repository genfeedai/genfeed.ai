declare module 'swagger-ui-react' {
  import { ComponentType } from 'react';

  type SwaggerUiRequest = Record<string, unknown>;
  type SwaggerUiResponse = Record<string, unknown>;

  export interface SwaggerUIProps {
    url?: string;
    spec?: object;
    onComplete?: (system: unknown) => void;
    requestInterceptor?: (
      req: SwaggerUiRequest,
    ) => Promise<SwaggerUiRequest> | SwaggerUiRequest;
    responseInterceptor?: (
      res: SwaggerUiResponse,
    ) => Promise<SwaggerUiResponse> | SwaggerUiResponse;
    docExpansion?: 'list' | 'full' | 'none';
    defaultModelsExpandDepth?: number;
    displayOperationId?: boolean;
    filter?: boolean | string;
    showExtensions?: boolean;
    showCommonExtensions?: boolean;
    supportedSubmitMethods?: string[];
    validatorUrl?: string | null;
  }

  const SwaggerUI: ComponentType<SwaggerUIProps>;
  export default SwaggerUI;
}
