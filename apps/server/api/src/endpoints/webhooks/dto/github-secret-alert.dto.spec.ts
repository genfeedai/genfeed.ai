import { GitHubSecretAlertDto } from '@api/endpoints/webhooks/dto/github-secret-alert.dto';
import { type ArgumentMetadata, ParseArrayPipe } from '@nestjs/common';

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

  it('should accept an array of well-formed alerts', async () => {
    const result = await pipe.transform([validAlert], metadata);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(GitHubSecretAlertDto);
    expect(result[0]).toMatchObject(validAlert);
  });
});
