import { UnauthorizedException } from '@nestjs/common';

export class CredentialRefreshRejectedException extends UnauthorizedException {}
