const { notarize } = require('@electron/notarize');

exports.default = async function notarizeDesktop(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appleApiKey = process.env.APPLE_API_KEY;
  const appleApiKeyId = process.env.APPLE_API_KEY_ID;
  const appleApiIssuer = process.env.APPLE_API_ISSUER;

  if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
    console.log(
      'Skipping notarization: App Store Connect API credentials not configured.',
    );
    return;
  }

  await notarize({
    appBundleId: 'ai.genfeed.desktop',
    appPath: `${appOutDir}/${packager.appInfo.productFilename}.app`,
    appleApiIssuer,
    appleApiKey,
    appleApiKeyId,
  });
};
