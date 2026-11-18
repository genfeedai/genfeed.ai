import { describe, expect, test } from 'bun:test';
import { prepareServerImage } from './prepare-server-image';

const source = 'ghcr.io/example/server';
const destination = '123456789012.dkr.ecr.eu-west-1.amazonaws.com/server';
const base = `sha256:${'a'.repeat(64)}`;
const overlay = `sha256:${'b'.repeat(64)}`;
const config = { source, destination, tag: 'abc123' };

describe('hosted server image', () => {
  test('copies the exact public digest', () => {
    const commands: string[][] = [];
    const result = prepareServerImage(config, (command, args) => {
      commands.push([command, ...args]);
      return args.includes('inspect') ? JSON.stringify(base) : '';
    });
    expect(result).toEqual({ digest: base, publicDigest: base });
    expect(commands).toHaveLength(3);
    expect(commands[1]).toContain(`${source}@${base}`);
    expect(commands.flat()).not.toContain('build');
  });

  test('rejects a public destination and an unsafe tag before any network command', () => {
    const execute = () => {
      throw new Error('must not run');
    };
    expect(() =>
      prepareServerImage(
        { ...config, destination: 'ghcr.io/example/private' },
        execute,
      ),
    ).toThrow('private ECR');
    expect(() =>
      prepareServerImage({ ...config, tag: 'foo; echo bad' }, execute),
    ).toThrow('Invalid source');
  });

  test('refuses an image copy whose digest changed', () => {
    let inspected = false;
    expect(() =>
      prepareServerImage(config, (_command, args) => {
        if (!args.includes('inspect')) return '';
        const value = inspected ? overlay : base;
        inspected = true;
        return JSON.stringify(value);
      }),
    ).toThrow('does not match');
  });
});

test('promotes the public base digest instead of the private overlay', async () => {
  const workflow = await Bun.file(
    '../../../.github/workflows/_deploy-hosted-saas-core.yml',
  ).text();
  const promotion = workflow.slice(workflow.indexOf('  promote-server-image:'));
  expect(promotion).toContain(
    `DIGEST: \${{ needs.deploy.outputs.public_image_digest }}`,
  );
  expect(promotion).not.toContain('needs.deploy.outputs.image_digest');
});
