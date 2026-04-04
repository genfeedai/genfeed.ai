import { SetMetadata } from '@nestjs/common';

export const RolesDecorator = (...args: string[]) => SetMetadata('roles', args);
