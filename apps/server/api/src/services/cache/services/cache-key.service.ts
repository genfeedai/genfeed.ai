import { Injectable } from '@nestjs/common';

@Injectable()
export class CacheKeyService {
  generate(namespace: string, ...parts: (string | number)[]): string {
    return `${namespace}:${parts.join(':')}`;
  }
}
