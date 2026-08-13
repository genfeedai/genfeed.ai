import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CompleteAgentAuthClaimDto,
  ExchangeAgentAuthClaimDto,
  RegisterAgentAuthDto,
  RevokeAgentAuthCredentialDto,
} from './agent-auth.dto';

describe('Agent Auth DTOs', () => {
  it('accepts verified-email registration with constrained scopes', async () => {
    const dto = plainToInstance(RegisterAgentAuthDto, {
      assertion: 'user@example.com',
      assertion_type: 'verified_email',
      requested_credential_type: 'api_key',
      requested_scopes: ['videos:read', 'images:create'],
      type: 'identity_assertion',
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects unsupported registration methods, credentials, and scopes', async () => {
    const dto = plainToInstance(RegisterAgentAuthDto, {
      assertion: 'not-an-email',
      assertion_type: 'id-jag',
      requested_credential_type: 'password',
      requested_scopes: ['admin'],
      type: 'anonymous',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('requires opaque claim tokens and a six-digit user code', async () => {
    const complete = plainToInstance(CompleteAgentAuthClaimDto, {
      claim_attempt_token: 'short',
      user_code: '12345',
    });
    const exchange = plainToInstance(ExchangeAgentAuthClaimDto, {
      claim_token: 'short',
    });
    const revoke = plainToInstance(RevokeAgentAuthCredentialDto, {
      token: 'not-a-genfeed-key',
    });

    expect(await validate(complete)).not.toHaveLength(0);
    expect(await validate(exchange)).not.toHaveLength(0);
    expect(await validate(revoke)).not.toHaveLength(0);
  });
});
