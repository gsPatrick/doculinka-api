// src/features/document/document.service.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Document, Signer, ShareToken, AuditLog, sequelize } = require('../../models');

// Serviços externos
const notificationService = require('../../services/notification.service');
const auditService = require('../audit/audit.service'); // Usando o serviço centralizado
const pdfService = require('../../services/pdf.service');

/**
 * Salva a imagem da assinatura (em Base64) como um arquivo PNG no disco.
 * @param {string} base64Image - A string Base64 da imagem PNG.
 * @param {string} tenantId - O ID do tenant para organizar os arquivos.
 * @param {string} signerId - O ID do signatário para nomear o arquivo.
 * @returns {Promise<string>} O caminho relativo do arquivo salvo.
 */
const saveSignatureImage = async (base64Image, tenantId, signerId) => {
  // Remove o prefixo da string Base64 (ex: "data:image/png;base64,")
  const base64Data = base64Image.replace(/^data:image\/png;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, 'base64');
  
  const dir = path.join(__dirname, '..', '..', '..', 'uploads', tenantId, 'signatures');
  await fs.mkdir(dir, { recursive: true });
  
  const filePath = path.join(dir, `${signerId}.png`);
  await fs.writeFile(filePath, imageBuffer);
  
  // Retorna o caminho RELATIVO para ser salvo no banco de dados
  return path.relative(path.join(__dirname, '..', '..', '..'), filePath);
};

/**
 * Cria um registro de documento, lida com o upload do arquivo, calcula seu hash
 * e cria o primeiro evento de auditoria.
 */
const createDocumentAndHandleUpload = async ({ file, title, deadlineAt, user }) => {
  const transaction = await sequelize.transaction();
  try {
    const doc = await Document.create({
      tenantId: user.tenantId,
      ownerId: user.id,
      title: title || file.originalname,
      deadlineAt,
      mimeType: file.mimetype,
      size: file.size,
      status: 'DRAFT',
    }, { transaction });

    const permanentDir = path.join(__dirname, '..', '..', '..', 'uploads', user.tenantId);
    await fs.mkdir(permanentDir, { recursive: true });
    const fileExtension = path.extname(file.originalname);
    const permanentPath = path.join(permanentDir, `${doc.id}${fileExtension}`);
    
    await fs.rename(file.path, permanentPath);

    const fileBuffer = await fs.readFile(permanentPath);
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    doc.storageKey = path.relative(path.join(__dirname, '..', '..', '..'), permanentPath);
    doc.sha256 = sha256;
    doc.status = 'READY';
    await doc.save({ transaction });

    // Log de Auditoria Centralizado
    await auditService.createEntry({
      tenantId: user.tenantId,
      actorKind: 'USER',
      actorId: user.id,
      entityType: 'DOCUMENT',
      entityId: doc.id,
      action: 'STORAGE_UPLOADED',
      ip: 'SYSTEM', // Pode ser melhorado passando req.ip do controller
      userAgent: 'SYSTEM',
      payload: { fileName: file.originalname, sha256 }
    }, transaction);

    await transaction.commit();
    return doc;
  } catch (error) {
    await transaction.rollback();
    if (file && file.path) {
      await fs.unlink(file.path).catch(err => console.error("Falha ao limpar arquivo temporário após erro:", err));
    }
    throw error;
  }
};

/**
 * Encontra um documento pelo ID, garantindo que ele pertença ao tenant do usuário.
 */
const findDocumentById = async (docId, user) => {
    const document = await Document.findOne({
        where: { id: docId, tenantId: user.tenantId },
        include: [{ model: Signer, as: 'Signers'}]
    });
    if (!document) throw new Error('Documento não encontrado ou acesso negado.');
    return document;
};

/**
 * Atualiza os detalhes de um documento (apenas campos permitidos como título e prazo).
 */
const updateDocumentDetails = async (docId, updates, user) => {
    const document = await findDocumentById(docId, user);
    const allowedUpdates = ['title', 'deadlineAt', 'autoReminders'];
    const validUpdates = {};
    for (const key of allowedUpdates) {
        if (updates[key] !== undefined) {
            validUpdates[key] = updates[key];
        }
    }
    await document.update(validUpdates);
    return document;
};

/**
 * Obtém o caminho absoluto do arquivo no servidor para permitir o download interno ou processamento.
 */
const getDocumentFilePath = async (docId, user) => {
    const document = await Document.findOne({
      where: { id: docId, ownerId: user.id } // Garantindo que só o dono possa acessar
    });

    if (!document || !document.storageKey) {
      throw new Error('Arquivo do documento não encontrado ou acesso negado.');
    }
    
    const absolutePath = path.join(__dirname, '..', '..', '..', document.storageKey);
    const originalName = document.title.includes('.') ? document.title : `${document.title}${path.extname(document.storageKey)}`;
    return { filePath: absolutePath, originalName };
};

/**
 * Retorna a URL pública para download do documento.
 */
const getDocumentDownloadUrl = async (docId, user) => {
    // Valida o acesso ao documento
    const document = await Document.findOne({
        where: { id: docId, ownerId: user.id }
    });
    if (!document) {
        throw new Error('Documento não encontrado ou acesso negado.');
    }
    
    // Constrói uma URL pública para o arquivo.
    // Isso requer que a pasta 'uploads' seja servida estaticamente pelo Express.
    const fileUrl = `${process.env.API_BASE_URL}/${document.storageKey}`;
    
    return { url: fileUrl };
};

/**
 * Adiciona um ou mais signatários a um documento e dispara os convites de assinatura.
 */
const addSignersToDocument = async (docId, signers, message, user) => {
  const transaction = await sequelize.transaction();
  try {
    const document = await Document.findOne({ where: { id: docId, tenantId: user.tenantId }, transaction });
    if (!document) {
      throw new Error('Documento não encontrado ou acesso negado.');
    }

    for (const signerData of signers) {
      // Cria o registro do signatário no banco
      const signer = await Signer.create({
        documentId: docId,
        name: signerData.name,
        email: signerData.email,
        phoneWhatsE164: signerData.phone,
        cpf: signerData.cpf,
        qualification: signerData.qualification,
        authChannels: signerData.authChannels,
        order: signerData.order || 0
      }, { transaction });

      // Gera um token de acesso único para o link
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      // Prazo padrão de 30 dias se o documento não tiver deadline
      const expiresAt = document.deadlineAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await ShareToken.create({
        documentId: docId,
        signerId: signer.id,
        tokenHash,
        expiresAt,
      }, { transaction });

      // Registra o evento de convite na trilha de auditoria
      await auditService.createEntry({
        tenantId: user.tenantId,
        actorKind: 'USER',
        actorId: user.id,
        entityType: 'SIGNER',
        entityId: signer.id,
        action: 'INVITED',
        ip: 'SYSTEM', // Pode ser passado pelo controller
        userAgent: 'SYSTEM',
        payload: { documentId: docId, recipient: signer.email }
      }, transaction);
      
      // --- INTEGRAÇÃO WHITELABEL ---
      // Passa o tenantId para que o serviço busque as chaves de API corretas (Z-API/Resend)
      await notificationService.sendSignInvite(signer, token, message, document.tenantId);
      // -----------------------------
    }
    
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Retorna a trilha de auditoria completa de um documento e seus signatários.
 */
const findAuditTrail = async (docId, user) => {
    await findDocumentById(docId, user); // Valida acesso
    const signers = await Signer.findAll({ where: { documentId: docId }, attributes: ['id'] });
    const signerIds = signers.map(s => s.id);

    // Busca logs formatados usando o auditService
    // Nota: Se quiser a lista crua, use AuditLog.findAll. 
    // Se quiser a formatada, use auditService.listLogs, mas precisaria adaptar os filtros lá.
    // Aqui retornamos o modelo cru para o controller específico do documento, ou podemos adaptar.
    return AuditLog.findAll({
        where: {
            [Op.or]: [
                { entityType: 'DOCUMENT', entityId: docId },
                { entityType: 'SIGNER', entityId: { [Op.in]: signerIds } }
            ]
        },
        order: [['createdAt', 'ASC']]
    });
};

/**
 * Altera o status de um documento (ex: para CANCELLED ou EXPIRED).
 */
const changeDocumentStatus = async (docId, newStatus, user) => {
  const transaction = await sequelize.transaction();
  try {
    const document = await Document.findOne({ where: { id: docId, tenantId: user.tenantId }, transaction });
    if (!document) throw new Error('Documento não encontrado.');
    
    document.status = newStatus;
    await document.save({ transaction });

    await auditService.createEntry({
      tenantId: user.tenantId,
      actorKind: 'USER',
      actorId: user.id,
      entityType: 'DOCUMENT',
      entityId: docId,
      action: 'STATUS_CHANGED',
      ip: 'SYSTEM',
      userAgent: 'SYSTEM',
      payload: { newStatus }
    }, transaction);

    await transaction.commit();
    return document;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const findAllDocuments = async (user, status) => {
    const whereClause = {
        ownerId: user.id,
    };

    const statusMap = {
        pendentes: ['READY', 'PARTIALLY_SIGNED'],
        concluidos: ['SIGNED'],
        lixeira: ['CANCELLED', 'EXPIRED'],
    };
    
    if (status && statusMap[status]) {
        whereClause.status = { [Op.in]: statusMap[status] };
    } else {
        whereClause.status = { [Op.notIn]: ['CANCELLED'] };
    }

    return Document.findAll({
        where: whereClause,
        order: [['createdAt', 'DESC']],
        include: [{ model: Signer, as: 'Signers'}]
    });
};

const getDocumentStats = async (user) => {
  const ownerId = user.id;

  const [pendingCount, signedCount, totalCount] = await Promise.all([
    Document.count({ where: { ownerId, status: { [Op.in]: ['READY', 'PARTIALLY_SIGNED'] } } }),
    Document.count({ where: { ownerId, status: 'SIGNED' } }),
    Document.count({ where: { ownerId, status: { [Op.notIn]: ['CANCELLED'] } } })
  ]);

  return {
    pending: pendingCount,
    signed: signedCount,
    total: totalCount,
  };
};

module.exports = {
  saveSignatureImage,
  createDocumentAndHandleUpload,
  findDocumentById,
  updateDocumentDetails,
  getDocumentFilePath,
  getDocumentDownloadUrl,
  addSignersToDocument,
  findAuditTrail,
  changeDocumentStatus,
  findAllDocuments,
  getDocumentStats
};