import { readLogoUploadIntake } from '@api/collections/assets/utils/logo-upload-intake.util';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

function upload(buffer: Buffer, mimetype: string, originalname: string) {
  return { buffer, mimetype, originalname };
}

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" onload="alert(1)"><rect width="120" height="40"/></svg>',
);

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error: unknown) {
    return error instanceof BadRequestException ? error.message : 'other';
  }
}

describe('readLogoUploadIntake', () => {
  it('sanitizes a brand logo SVG and keeps that markup as the vector', async () => {
    const intake = await readLogoUploadIntake(
      upload(SVG, 'image/svg+xml', 'mark.svg'),
      true,
    );

    expect(intake).toMatchObject({
      contentType: 'image/svg+xml',
      originalFormat: 'svg',
      originalHeight: 40,
      originalWidth: 120,
    });
    expect(intake.vector?.toString()).toBe(intake.body.toString());
    expect(intake.body.toString()).not.toContain('onload');
  });

  it('records the format and size of a raster upload and passes it through', async () => {
    const png = await sharp({
      create: { background: '#000', channels: 4, height: 30, width: 90 },
    })
      .png()
      .toBuffer();

    const intake = await readLogoUploadIntake(
      upload(png, 'image/png', 'logo.png'),
      true,
    );

    expect(intake).toEqual({
      body: png,
      contentType: 'image/png',
      originalFormat: 'png',
      originalHeight: 30,
      originalWidth: 90,
    });
  });

  it.each([
    [
      'an SVG for anything but a brand logo',
      upload(SVG, 'image/svg+xml', 'banner.svg'),
      false,
      'svg_upload_brand_logo_only',
    ],
    [
      'an SVG with no size the renderer can read',
      upload(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'),
        'image/svg+xml',
        'mark.svg',
      ),
      true,
      'svg_logo_unreadable',
    ],
    [
      'a file named .svg that is not an SVG',
      upload(Buffer.from('<html></html>'), 'image/svg+xml', 'page.svg'),
      true,
      'svg_logo_not_svg',
    ],
  ])('refuses %s', async (_case, file, isVectorAllowed, reason) => {
    expect(await refusal(readLogoUploadIntake(file, isVectorAllowed))).toBe(
      reason,
    );
  });
});
