// src/features/signer/signer.service.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Importa todos os modelos e serviços necessários
const { Document, Signer, OtpCode, AuditLog, Certificate, User, sequelize } = require('../../models');
const notificationService = require('../../services/notification.service');
const documentService = require('../document/document.service');
const pdfService = require('../../services/pdf.service');
const { createAuditLog } = require('../document/document.service');


/**
 * Salva a imagem da assinatura (em Base64) como um arquivo PNG no disco.
 */
const saveSignatureImage = async (base64Image, tenantId, signerId) => {
  if (!base64Image) {
    throw new Error("Imagem da assinatura (Base64) não fornecida.");
  }
  const base64Data = base64Image.replace(/^data:image\/png;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, 'base64');
  
  const dir = path.join(__dirname, '..', '..', '..', 'uploads', tenantId, 'signatures');
  await fs.mkdir(dir, { recursive: true });
  
  const filePath = path.join(dir, `${signerId}.png`);
  await fs.writeFile(filePath, imageBuffer);
  
  return path.relative(path.join(__dirname, '..', '..', '..'), filePath);
};

/**
 * Obtém o resumo do documento para o signatário, incluindo a URL para visualização.
 */
const getSignerSummary = async (document, signer, req) => {
  if (signer.status === 'PENDING') {
    signer.status = 'VIEWED';
    await signer.save();
    await createAuditLog({
      tenantId: document.tenantId,
      actorKind: 'SIGNER',
      actorId: signer.id,
      entityType: 'DOCUMENT',
      entityId: document.id,
      action: 'VIEWED',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  const owner = await User.findByPk(document.ownerId);
  if (!owner) {
    throw new Error("Proprietário do documento não encontrado.");
  }
  
  const { url: documentUrl } = await documentService.getDocumentDownloadUrl(document.id, owner);
  
  return {
    document: {
      id: document.id,
      title: document.title,
      createdAt: document.createdAt,
      deadlineAt: document.deadlineAt,
      url: documentUrl,
    },
    signer: {
      name: signer.name,
      email: signer.email,
      phoneWhatsE164: signer.phoneWhatsE164,
      status: signer.status,
    }
  };
};

/**
 * Atualiza os dados de identificação do signatário (CPF e telefone).
 */
const identifySigner = async (signer, { cpf, phone }) => {
  if (cpf) signer.cpf = cpf;
  if (phone) signer.phoneWhatsE164 = phone;
  await signer.save();
};

/**
 * Inicia o processo de verificação por OTP.
 */
const startOtpVerification = async (signer, req) => {
  const otp = crypto.randomInt(100000, 999999).toString();
  const codeHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

  for (const channel of signer.authChannels) {
    const recipient = channel === 'EMAIL' ? signer.email : signer.phoneWhatsE164;
    if (!recipient) continue;

    await OtpCode.create({ recipient, channel, codeHash, expiresAt, context: 'SIGNING' });
    notificationService.sendOtp(recipient, channel, otp);
    
    await createAuditLog({
        tenantId: req.document.tenantId,
        actorKind: 'SYSTEM',
        entityType: 'OTP',
        entityId: signer.id,
        action: 'OTP_SENT',
        payload: { channel, recipient }
    }, req.transaction); // Passa a transação se existir
  }
};

/**
 * Verifica o código OTP fornecido pelo usuário.
 */
const verifyOtp = async (signer, otp, req) => {
    const recipients = [signer.email, signer.phoneWhatsE164].filter(Boolean);
    const otpRecord = await OtpCode.findOne({
      where: { recipient: recipients, context: 'SIGNING' },
      order: [['createdAt', 'DESC']]
    });

    if (!otpRecord || new Date() > new Date(otpRecord.expiresAt)) {
        throw new Error('Código OTP inválido ou expirado.');
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.codeHash);
    if (!isMatch) {
        throw new Error('Código OTP inválido.');
    }

    await createAuditLog({ tenantId: req.document.tenantId, actorKind: 'SIGNER', actorId: signer.id, entityType: 'OTP', entityId: signer.id, action: 'OTP_VERIFIED' });
    
    await otpRecord.destroy();
};

/**
 * Salva a posição (x, y, página) da assinatura visual definida pelo signatário.
 */
const saveSignaturePosition = async (signer, position) => {
  signer.signaturePositionX = position.x;
  signer.signaturePositionY = position.y;
  signer.signaturePositionPage = position.page;
  await signer.save();
};

/**
 * Finaliza o processo de assinatura, gerando o hash, salvando a imagem,
 * e, se for o último, gerando o PDF final com os carimbos visuais.
 */
const commitSignature = async (document, signer, clientFingerprint, signatureImageBase64, req) => {
    const transaction = await sequelize.transaction();
    try {
        const timestampISO = new Date().toISOString();
        const signatureHash = crypto.createHash('sha256')
            .update(document.sha256 + signer.id + timestampISO + clientFingerprint)
            .digest('hex');

        const artefactPath = await saveSignatureImage(signatureImageBase64, document.tenantId, signer.id);

        signer.status = 'SIGNED';
        signer.signedAt = new Date();
        signer.signatureHash = signatureHash;
        signer.signatureArtefactPath = artefactPath;
        await signer.save({ transaction });

        await createAuditLog({
            tenantId: document.tenantId,
            actorKind: 'SIGNER',
            actorId: signer.id,
            entityType: 'DOCUMENT',
            entityId: document.id,
            action: 'SIGNED',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            payload: { signatureHash, artefactPath }
        }, transaction);

        const signersInDoc = await Signer.findAll({ where: { documentId: document.id }, transaction });
        const allSigned = signersInDoc.every(s => s.status === 'SIGNED');

        if (allSigned) {
            console.log(`[FINALIZE] Todos os signatários assinaram o doc ${document.id}. Gerando PDF final...`);
            
            const originalFilePath = path.join(__dirname, '..', '..', '..', document.storageKey);
            
            // --- CORREÇÃO IMPORTANTE ---
            // Usa a lista 'signersInDoc' que já foi buscada DENTRO da transação.
            // Isso garante que temos os dados mais recentes, incluindo a posição da assinatura
            // que pode ter sido salva momentos antes.
            const signedPdfBuffer = await pdfService.embedSignatures(originalFilePath, signersInDoc);
            
            const signedFileStorageKey = document.storageKey.replace(/(\.[\w\d_-]+)$/i, '-signed$1');
            const signedFilePath = path.join(__dirname, '..', '..', '..', signedFileStorageKey);
            await fs.writeFile(signedFilePath, signedPdfBuffer);
            console.log(`[FINALIZE] PDF final com assinaturas visuais salvo em: ${signedFilePath}`);

            const newSha256 = crypto.createHash('sha256').update(signedPdfBuffer).digest('hex');

            document.status = 'SIGNED';
            document.storageKey = signedFileStorageKey;
            document.sha256 = newSha256;
            await document.save({ transaction });

            await createAuditLog({ 
                tenantId: document.tenantId, 
                actorKind: 'SYSTEM', 
                entityType: 'DOCUMENT', 
                entityId: document.id, 
                action: 'STATUS_CHANGED', 
                payload: { newStatus: 'SIGNED' }
            }, transaction);

            const certificateStorageKey = `certificates/${document.id}.pdf`;
            const certificateSha256 = crypto.createHash('sha256').update('conteudo_pdf_do_certificado_simulado').digest('hex');
            
            await Certificate.create({
                documentId: document.id,
                storageKey: certificateStorageKey,
                sha256: certificateSha256
            }, { transaction });

            await createAuditLog({ 
                tenantId: document.tenantId, 
                actorKind: 'SYSTEM', 
                entityType: 'DOCUMENT', 
                entityId: document.id, 
                action: 'CERTIFICATE_ISSUED'
            }, transaction);
        }

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        console.error("Erro durante o commit da assinatura:", error);
        throw error;
    }
};

module.exports = {
  getSignerSummary,
  identifySigner,
  startOtpVerification,
  verifyOtp,
  commitSignature,
  saveSignaturePosition,
};