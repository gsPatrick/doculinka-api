// src/features/document/folder.service.js
'use strict';

const { Folder, Document, User } = require('../../models');
const { Op } = require('sequelize');

// Note que adicionamos 'tenantId' na desestruturação ou como argumento extra

const createFolder = async (user, { name, parentId, color, tenantId }) => {
    const targetTenant = tenantId || user.tenantId;

    if (parentId) {
        const parent = await Folder.findOne({ where: { id: parentId, tenantId: targetTenant } });
        if (!parent) throw new Error('Pasta pai não encontrada ou acesso negado.');
    }

    return Folder.create({
        tenantId: targetTenant,
        ownerId: user.id, // O criador continua sendo o admin logado
        parentId: parentId || null,
        name,
        color
    });
};

const listContents = async (user, { parentId, search, tenantId }) => {
    const targetTenant = tenantId || user.tenantId;

    const folderWhere = { tenantId: targetTenant };
    const docWhere = { tenantId: targetTenant };

    if (search) {
        folderWhere.name = { [Op.iLike]: `%${search}%` };
        docWhere.title = { [Op.iLike]: `%${search}%` };
    } else {
        const targetId = (parentId === 'root' || !parentId) ? null : parentId;
        folderWhere.parentId = targetId;
        docWhere.folderId = targetId;
    }

    const folders = await Folder.findAll({
        where: folderWhere,
        order: [['name', 'ASC']],
        include: [{ model: User, as: 'creator', attributes: ['name'] }]
    });

    docWhere.status = { [Op.ne]: 'CANCELLED' }; 
    
    const documents = await Document.findAll({
        where: docWhere,
        order: [['createdAt', 'DESC']],
        include: [{ model: User, as: 'owner', attributes: ['name'] }]
    });

    let breadcrumbs = [];
    if (parentId && parentId !== 'root' && !search) {
        let current = await Folder.findByPk(parentId);
        // Segurança: garantir que a pasta pertence ao tenant alvo
        if(current && current.tenantId === targetTenant) {
            while(current) {
                breadcrumbs.unshift({ id: current.id, name: current.name });
                if (current.parentId) {
                    current = await Folder.findByPk(current.parentId);
                } else {
                    current = null;
                }
            }
        }
        breadcrumbs.unshift({ id: 'root', name: 'Início' });
    }

    return { breadcrumbs, folders, documents };
};

const moveItem = async (user, { itemId, itemType, targetFolderId, tenantId }) => {
    const targetTenant = tenantId || user.tenantId;
    
    let targetId = targetFolderId;
    if (targetId === 'root') targetId = null;

    if (targetId) {
        const target = await Folder.findOne({ where: { id: targetId, tenantId: targetTenant } });
        if (!target) throw new Error('Pasta de destino inválida.');
    }

    if (itemType === 'DOCUMENT') {
        const doc = await Document.findOne({ where: { id: itemId, tenantId: targetTenant } });
        if (!doc) throw new Error('Documento não encontrado.');
        doc.folderId = targetId;
        await doc.save();
    } else {
        const folder = await Folder.findOne({ where: { id: itemId, tenantId: targetTenant } });
        if (!folder) throw new Error('Pasta não encontrada.');
        if (targetId === itemId) throw new Error('Movimento ilegal.');
        folder.parentId = targetId;
        await folder.save();
    }
    return { message: 'Item movido com sucesso.' };
};

const deleteFolder = async (user, folderId, tenantId) => {
    const targetTenant = tenantId || user.tenantId;
    const folder = await Folder.findOne({ where: { id: folderId, tenantId: targetTenant } });
    if (!folder) throw new Error('Pasta não encontrada.');

    await Document.update({ folderId: null }, { where: { folderId } });
    await folder.destroy();
    return { message: 'Pasta removida.' };
};

const renameFolder = async (user, folderId, newName, tenantId) => {
    const targetTenant = tenantId || user.tenantId;
    const folder = await Folder.findOne({ where: { id: folderId, tenantId: targetTenant } });
    if (!folder) throw new Error('Pasta não encontrada.');
    
    folder.name = newName;
    await folder.save();
    return folder;
};

module.exports = { createFolder, listContents, moveItem, deleteFolder, renameFolder };