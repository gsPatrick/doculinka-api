// src/features/document/folder.controller.js
'use strict';

const folderService = require('./folder.service');

// Helper para definir o Tenant correto
const getContextTenant = (req) => {
    // Se for SUPER_ADMIN e enviou ?targetTenantId, usa esse ID.
    // Caso contrário, usa o tenant do próprio usuário logado.
    if (req.user.role === 'SUPER_ADMIN' && req.query.targetTenantId) {
        return req.query.targetTenantId;
    }
    if (req.user.role === 'SUPER_ADMIN' && req.body.targetTenantId) {
        return req.body.targetTenantId;
    }
    return req.user.tenantId;
};

const create = async (req, res, next) => {
    try {
        const tenantId = getContextTenant(req);
        const folder = await folderService.createFolder(req.user, { ...req.body, tenantId });
        res.status(201).json(folder);
    } catch(e) { next(e); }
};

const list = async (req, res, next) => {
    try {
        const tenantId = getContextTenant(req);
        // Passamos o tenantId explicitamente para o service
        const data = await folderService.listContents(req.user, { ...req.query, tenantId });
        res.status(200).json(data);
    } catch(e) { next(e); }
};

const move = async (req, res, next) => {
    try {
        const tenantId = getContextTenant(req);
        const result = await folderService.moveItem(req.user, { ...req.body, tenantId });
        res.status(200).json(result);
    } catch(e) { next(e); }
};

const remove = async (req, res, next) => {
    try {
        const tenantId = getContextTenant(req);
        const result = await folderService.deleteFolder(req.user, req.params.id, tenantId);
        res.status(200).json(result);
    } catch(e) { next(e); }
};

const rename = async (req, res, next) => {
    try {
        const tenantId = getContextTenant(req);
        const { name } = req.body;
        const result = await folderService.renameFolder(req.user, req.params.id, name, tenantId);
        res.status(200).json(result);
    } catch(e) { next(e); }
};

module.exports = { create, list, move, remove, rename };