import { GitHubSecretAlertDto } from '@api/endpoints/webhooks/dto/github-secret-alert.dto';
import {
  type ArgumentMetadata,
  BadRequestException,
  ParseArrayPipe,
} from '@nestjs/common';

const metadata: ArgumentMetadata = {
  data: '',
  metatype: Array,
  type: 'body',
};

const validAlert = {
  source: 'commit',
  token: 'gf_test_exampletoken',
  type: 'genfeed_api_key',
  url: 'https://github.com/example/repo/blob/main/config.ts',
};

describe('GitHubSecretAlertDto', () => {
  let pipe: ParseArrayPipe;

  beforeEach(() => {
    pipe = new ParseArrayPipe({ items: GitHubSecretAlertDto });
  });

  it('should reject a body that is not an array', async () => {
    await expect(pipe.transform(validAlert, metadata)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject an alert missing the token', async () => {
    const { token: _token, ...withoutToken } = validAlert;

    await expect(pipe.transform([withoutToken], metadata)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject an alert missing the type', async () => {
    const { type: _type, ...withoutType } = validAlert;

    await expect(pipe.transform([withoutType], metadata)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject an alert missing the url', async () => {
    const { url: _url, ...withoutUrl } = validAlert;

    await expect(pipe.transform([withoutUrl], metadata)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject a valid array containing one malformed alert', async () => {
    await expect(
      pipe.transform(
        [validAlert, { token: 42, type: 't', url: 'u' }],
        metadata,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should accept an array of well-formed alerts', async () => {
    const result = await pipe.transform([validAlert], metadata);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(GitHubSecretAlertDto);
    expect(result[0]).toMatchObject(validAlert);
  });

  it('should accept an alert without the optional source', async () => {
    const { source: _source, ...withoutSource } = validAlert;

    const result = await pipe.transform([withoutSource], metadata);

    expect(result[0]).toMatchObject(withoutSource);
  });

  it('should accept an empty batch', async () => {
    await expect(pipe.transform([], metadata)).resolves.toEqual([]);
  });
});
