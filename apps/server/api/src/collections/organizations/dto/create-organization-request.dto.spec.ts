import { OrganizationsController } from '@api/collections/organizations/controllers/organizations.controller';
import { CreateOrganizationRequestDto } from '@api/collections/organizations/dto/create-organization-request.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { ORGANIZATION_NAME_MAX_LENGTH } from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('CreateOrganizationRequestDto', () => {
  const pipe = new ValidationPipe();

  it('is the body type POST /organizations validates against', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      OrganizationsController.prototype,
      'create',
    ) as unknown[];

    expect(paramTypes[2]).toBe(CreateOrganizationRequestDto);
  });

  it('accepts the create-organization modal body and keeps the description', async () => {
    const result = (await pipe.transform(
      {
        description: 'Content for the channel.',
        label: 'Ship Shit Show!',
      },
      { metatype: CreateOrganizationRequestDto, type: 'body' },
    )) as CreateOrganizationRequestDto;

    expect(result.label).toBe('Ship Shit Show!');
    expect(result.description).toBe('Content for the channel.');
  });

  it('strips client-supplied ownership fields', async () => {
    const result = (await pipe.transform(
      { isSelected: true, label: 'Acme', userId: 'user_other' },
      { metatype: CreateOrganizationRequestDto, type: 'body' },
    )) as Record<string, unknown>;

    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('isSelected');
  });

  it('accepts a label alone', async () => {
    const result = (await pipe.transform(
      { label: 'Acme' },
      { metatype: CreateOrganizationRequestDto, type: 'body' },
    )) as CreateOrganizationRequestDto;

    expect(result.label).toBe('Acme');
    expect(result.description).toBeUndefined();
    expect(result.websiteUrl).toBeUndefined();
  });

  it.each(['acme.com', 'www.acme.co.uk', 'https://acme.com/about'])(
    'accepts the website %s',
    async (websiteUrl) => {
      const result = (await pipe.transform(
        { label: 'Acme', websiteUrl },
        { metatype: CreateOrganizationRequestDto, type: 'body' },
      )) as CreateOrganizationRequestDto;

      expect(result.websiteUrl).toBe(websiteUrl);
    },
  );

  it.each(['not a site', 'acme', 'ftp://acme.com'])(
    'rejects the website %s',
    async (websiteUrl) => {
      await expect(
        pipe.transform(
          { label: 'Acme', websiteUrl },
          { metatype: CreateOrganizationRequestDto, type: 'body' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects a label over the shared length limit', async () => {
    await expect(
      pipe.transform(
        { label: 'a'.repeat(ORGANIZATION_NAME_MAX_LENGTH + 1) },
        { metatype: CreateOrganizationRequestDto, type: 'body' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing label', async () => {
    await expect(
      pipe.transform(
        { description: 'No name' },
        { metatype: CreateOrganizationRequestDto, type: 'body' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
