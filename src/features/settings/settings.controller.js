const settingsService = require('./settings.service');
const auditService = require('../audit/audit.service');

const get = async (req, res, next) => {
  try {
    const settings = await settingsService.getSettings(req.user.tenantId);
    res.json(settings);
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const updated = await settingsService.updateSettings(req.user.tenantId, req.body);
    
    // Log de Auditoria para mudança crítica
    await auditService.createEntry({
        tenantId: req.user.tenantId,
        actorKind: 'USER',
        actorId: req.user.id,
        entityType: 'SYSTEM',
        entityId: updated.id,
        action: 'SETTINGS_CHANGED',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        payload: { message: 'Configurações de integração atualizadas' }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

module.exports = { get, update };