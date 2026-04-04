import { PATH_METADATA } from '@nestjs/common/constants';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DECORATORS } from '@nestjs/swagger/dist/constants';

export function AutoSwagger(tag?: string): ClassDecorator {
  return (target: Function) => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, target);
    if (controllerPath && !Reflect.getMetadata(DECORATORS.API_TAGS, target)) {
      const tagName =
        tag ||
        (Array.isArray(controllerPath) ? controllerPath[0] : controllerPath);
      ApiTags(tagName)(target);
    }

    const prototype = target.prototype as Record<string, unknown>;

    Object.getOwnPropertyNames(prototype).forEach((methodName) => {
      if (methodName === 'constructor') {
        return;
      }
      const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
      if (!descriptor || typeof descriptor.value !== 'function') {
        return;
      }

      if (!Reflect.getMetadata(DECORATORS.API_OPERATION, descriptor.value)) {
        ApiOperation({ summary: methodName })(
          prototype,
          methodName,
          descriptor,
        );
      }
      if (!Reflect.getMetadata(DECORATORS.API_RESPONSE, descriptor.value)) {
        ApiResponse({ status: 200 })(prototype, methodName, descriptor);
      }
    });
  };
}
