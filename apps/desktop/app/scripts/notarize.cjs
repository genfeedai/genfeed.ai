const { notarize } = require('@electron/notarize');

exports.default = async function notarizeDesktop(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const appleTeamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !applePassword || !appleTeamId) {
    console.log('Skipping notarization: Apple credentials not configured.');
    return;
  }

  await notarize({
    appBundleId: 'ai.genfeed.desktop',
    appPath: `${appOutDir}/${packager.appInfo.productFilename}.app`,
    appleId,
    appleIdPassword: applePassword,
    teamId: appleTeamId,
  });
};
