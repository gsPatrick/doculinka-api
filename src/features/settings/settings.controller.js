// src/features/settings/settings.controller.js
'use strict';

// --- CORREÇÃO: Importar o modelo TenantSettings ---
const { TenantSettings } = require('../../models');
// -------------------------------------------------

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

const updateEmailTemplate = async (req, res, next) => {
    try {
        const { htmlContent } = req.body; // HTML puro vindo de um editor WYSIWYG do front
        
        // Busca ou cria a configuração para este tenant
        const settings = await TenantSettings.findOne({ where: { tenantId: req.user.tenantId } });
        
        if (!settings) {
            // Se não existir, cria (embora settingsService.getSettings já devesse garantir isso, é um fallback seguro)
            await TenantSettings.create({ 
                tenantId: req.user.tenantId, 
                finalEmailTemplate: htmlContent 
            });
        } else {
            settings.finalEmailTemplate = htmlContent;
            await settings.save();
        }

        // Log de Auditoria
        await auditService.createEntry({
            tenantId: req.user.tenantId,
            actorKind: 'USER',
            actorId: req.user.id,
            entityType: 'SYSTEM',
            entityId: settings ? settings.id : 'new',
            action: 'SETTINGS_CHANGED',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            payload: { message: 'Template de e-mail atualizado' }
        });

        res.json({ message: 'Template atualizado com sucesso.' });
    } catch (error) { 
        next(error); 
    }
};

module.exports = { get, update, updateEmailTemplate };