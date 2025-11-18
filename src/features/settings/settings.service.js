'use strict';
const { TenantSettings } = require('../../models');

const getSettings = async (tenantId) => {
  const [settings] = await TenantSettings.findOrCreate({
    where: { tenantId },
    defaults: { tenantId }
  });
  return settings;
};

const updateSettings = async (tenantId, data) => {
  const settings = await getSettings(tenantId);
  
  // Atualiza apenas campos permitidos
  await settings.update({
    appName: data.appName,
    primaryColor: data.primaryColor,
    logoUrl: data.logoUrl,
    zapiInstanceId: data.zapiInstanceId,
    zapiToken: data.zapiToken,
    zapiClientToken: data.zapiClientToken,
    zapiActive: data.zapiActive,
    resendApiKey: data.resendApiKey,
    resendActive: data.resendActive
  });

  return settings;
};

module.exports = { getSettings, updateSettings };