import { expect, test } from '../../fixtures/auth.fixture';

const BRAND_KIT_VISUAL = '/test-org/brand-1/settings/brand-kit/visual';

interface LutBrand {
  id: string;
  isLutEnabled: boolean;
  label: string;
  lutFileName: string | null;
  slug: string;
}

function cube(size: number): string {
  const samples: string[] = [];
  for (let blue = 0; blue < size; blue++)
    for (let green = 0; green < size; green++)
      for (let red = 0; red < size; red++)
        samples.push(
          `${red / (size - 1)} ${green / (size - 1)} ${blue / (size - 1)}`,
        );
  return [`LUT_3D_SIZE ${size}`, ...samples].join('\n');
}

test('a brand uploads a .cube, switches the grade on and removes it', async ({
  authenticatedPage,
}) => {
  let brand: LutBrand = {
    id: 'brand-1',
    isLutEnabled: false,
    label: 'Brand 1',
    lutFileName: null,
    slug: 'brand-1',
  };
  const writes: string[] = [];
  const respond = (route: import('@playwright/test').Route) =>
    route.fulfill({
      body: JSON.stringify({
        data: { attributes: brand, id: brand.id, type: 'brand' },
      }),
      contentType: 'application/json',
      status: 200,
    });

  await authenticatedPage.route('**/brands/slug**', respond);
  await authenticatedPage.route('**/brands/brand-1', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body: { isLutEnabled?: boolean } = route.request().postDataJSON();
      writes.push(`PATCH isLutEnabled=${body.isLutEnabled}`);
      brand = { ...brand, isLutEnabled: body.isLutEnabled ?? false };
    }
    await respond(route);
  });
  await authenticatedPage.route('**/brands/brand-1/lut', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = route.request().postDataBuffer()?.toString('utf8') ?? '';
      expect(body).toContain('name="file"');
      expect(body).toContain('filename="brand-look.cube"');
      expect(body).toContain('LUT_3D_SIZE 2');
      writes.push('PUT brand-look.cube');
      brand = { ...brand, lutFileName: 'brand-look.cube' };
    } else if (method === 'DELETE') {
      writes.push('DELETE');
      brand = { ...brand, isLutEnabled: false, lutFileName: null };
    }
    await respond(route);
  });

  await authenticatedPage.goto(BRAND_KIT_VISUAL, {
    waitUntil: 'domcontentloaded',
  });
  await authenticatedPage
    .getByRole('button', {
      name: 'Assets, references & watermark',
      exact: true,
    })
    .click();

  const card = authenticatedPage
    .getByText('Brand colour grade', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"flex-col")][1]');
  await expect(card.getByTestId('brand-lut-file-name')).toHaveText(
    'No LUT uploaded yet.',
  );
  await expect(
    card.getByRole('switch', { name: 'Grade finished videos with this LUT' }),
  ).toBeDisabled();

  // A file that is not a .cube never leaves the browser.
  await card.getByLabel('Upload .cube file').setInputFiles({
    buffer: Buffer.from('not a lut'),
    mimeType: 'image/png',
    name: 'look.png',
  });
  await expect(card.getByRole('alert')).toContainText('Choose a .cube file');
  expect(writes).toEqual([]);

  await card.getByLabel('Upload .cube file').setInputFiles({
    buffer: Buffer.from(cube(2)),
    mimeType: 'application/octet-stream',
    name: 'brand-look.cube',
  });
  await expect(card.getByTestId('brand-lut-file-name')).toHaveText(
    'brand-look.cube',
  );

  const toggle = card.getByRole('switch', {
    name: 'Grade finished videos with this LUT',
  });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toBeChecked();

  await card.getByRole('button', { name: 'Remove LUT' }).click();
  await expect(card.getByTestId('brand-lut-file-name')).toHaveText(
    'No LUT uploaded yet.',
  );
  await expect(toggle).not.toBeChecked();

  expect(writes).toEqual([
    'PUT brand-look.cube',
    'PATCH isLutEnabled=true',
    'DELETE',
  ]);
});
