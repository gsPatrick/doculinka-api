// src/features/signer/signer.service.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Importação dos Modelos
const { Document, Signer, OtpCode, AuditLog, Certificate, User, sequelize } = require('../../models');

// Importação dos Serviços
const notificationService = require('../../services/notification.service');
const documentService = require('../document/document.service');
const pdfService = require('../../services/pdf.service');
const auditService = require('../audit/audit.service'); // Serviço correto para logs

/**
 * Salva a imagem da assinatura (em Base64) como um arquivo PNG no disco.
 * @param {string} base64Image - String base64 da imagem.
 * @param {string} tenantId - ID do tenant.
 * @param {string} signerId - ID do signatário.
 */
const saveSignatureImage = async (base64Image, tenantId, signerId) => {
  if (!base64Image) {
    throw new Error("Imagem da assinatura (Base64) não fornecida.");
  }
  // Remove o cabeçalho do base64 se existir
  const base64Data = base64Image.replace(/^data:image\/png;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, 'base64');
  
  // Define o diretório de upload
  const dir = path.join(__dirname, '..', '..', '..', 'uploads', tenantId, 'signatures');
  await fs.mkdir(dir, { recursive: true });
  
  // Define o caminho do arquivo
  const filePath = path.join(dir, `${signerId}.png`);
  await fs.writeFile(filePath, imageBuffer);
  
  // Retorna o caminho relativo para salvar no banco
  return path.relative(path.join(__dirname, '..', '..', '..'), filePath);
};

/**
 * Obtém o resumo do documento para o signatário, incluindo a URL para visualização.
 * Registra o evento de visualização (VIEWED) na auditoria.
 */
const getSignerSummary = async (document, signer, req) => {
  // Se for a primeira vez que o signatário acessa, marca como visualizado
  if (signer.status === 'PENDING') {
    signer.status = 'VIEWED';
    await signer.save();
    
    // Log de Auditoria: VIEWED
    await auditService.createEntry({
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
  
  // Gera URL temporária ou pública para leitura
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
 * Inicia o processo de verificação por OTP (One-Time Password).
 * Envia o código para Email e WhatsApp.
 */
const startOtpVerification = async (signer, req) => {
  const otp = crypto.randomInt(100000, 999999).toString();
  const codeHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Expira em 10 minutos

  const channels = signer.authChannels || ['EMAIL'];

  for (const channel of channels) {
    const recipient = channel === 'EMAIL' ? signer.email : signer.phoneWhatsE164;
    if (!recipient) continue;

    // Salva o hash do OTP no banco
    await OtpCode.create({ 
        recipient, 
        channel, 
        codeHash, 
        expiresAt, 
        context: 'SIGNING' 
    });
    
    // Envia o OTP via notificação
    await notificationService.sendOtp(recipient, channel, otp, req.document.tenantId);
    
    // Log de Auditoria: OTP_SENT
    await auditService.createEntry({
        tenantId: req.document.tenantId,
        actorKind: 'SYSTEM',
        entityType: 'OTP',
        entityId: signer.id, // Vincula ao signatário
        action: 'OTP_SENT',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        payload: { channel, recipient_masked: recipient.replace(/(.{2})(.*)(@|.{2})$/, "$1***$3") }
    });
  }
};

/**
 * Verifica o código OTP fornecido pelo usuário.
 */
const verifyOtp = async (signer, otp, req) => {
    const recipients = [signer.email, signer.phoneWhatsE164].filter(Boolean);
    
    // Busca o OTP mais recente válido
    const otpRecord = await OtpCode.findOne({
      where: { recipient: recipients, context: 'SIGNING' },
      order: [['createdAt', 'DESC']]
    });

    // Validação: Existe e não expirou?
    if (!otpRecord || new Date() > new Date(otpRecord.expiresAt)) {
        // Log de Falha
        await auditService.createEntry({
             tenantId: req.document.tenantId, 
             actorKind: 'SIGNER', 
             actorId: signer.id, 
             entityType: 'OTP', 
             entityId: signer.id, 
             action: 'OTP_FAILED',
             ip: req.ip,
             userAgent: req.headers['user-agent'],
             payload: { reason: 'Expired or Not Found' }
        });
        throw new Error('Código OTP inválido ou expirado.');
    }

    // Validação: Hash bate?
    const isMatch = await bcrypt.compare(otp, otpRecord.codeHash);
    if (!isMatch) {
         // Log de Falha
         await auditService.createEntry({
             tenantId: req.document.tenantId, 
             actorKind: 'SIGNER', 
             actorId: signer.id, 
             entityType: 'OTP', 
             entityId: signer.id, 
             action: 'OTP_FAILED',
             ip: req.ip,
             userAgent: req.headers['user-agent'],
             payload: { reason: 'Incorrect Code' }
        });
        throw new Error('Código OTP inválido.');
    }

    // Log de Sucesso
    await auditService.createEntry({ 
        tenantId: req.document.tenantId, 
        actorKind: 'SIGNER', 
        actorId: signer.id, 
        entityType: 'OTP', 
        entityId: signer.id, 
        action: 'OTP_VERIFIED',
        ip: req.ip,
        userAgent: req.headers['user-agent']
    });
    
    // Remove o OTP usado para evitar replay
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
 * Finaliza o processo de assinatura.
 * Gera hash, salva imagem, cria logs e, se for o último, gera o PDF final.
 */
const commitSignature = async (document, signer, clientFingerprint, signatureImageBase64, req) => {
    const transaction = await sequelize.transaction();
    let resultData = {};

    try {
        const timestampISO = new Date().toISOString();
        
        // 1. Gera o Hash SHA256 da Assinatura (Prova técnica de integridade)
        // Combina: Hash do Doc Original + ID do Signatário + Hora + Fingerprint do Navegador
        const signatureHash = crypto.createHash('sha256')
            .update(document.sha256 + signer.id + timestampISO + clientFingerprint)
            .digest('hex');
        
        // 2. Gera um Código Curto para exibição (Protocolo visual)
        const shortCode = signatureHash.substring(0, 6).toUpperCase();

        // 3. Salva a imagem da assinatura no disco
        const artefactPath = await saveSignatureImage(signatureImageBase64, document.tenantId, signer.id);

        // 4. Atualiza o Signatário
        signer.status = 'SIGNED';
        signer.signedAt = new Date();
        signer.signatureHash = signatureHash;
        signer.signatureArtefactPath = artefactPath;
        await signer.save({ transaction });

        // 5. Log de Auditoria: SIGNED
        await auditService.createEntry({
            tenantId: document.tenantId,
            actorKind: 'SIGNER',
            actorId: signer.id,
            entityType: 'DOCUMENT',
            entityId: document.id,
            action: 'SIGNED',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            payload: { signatureHash, artefactPath, shortCode, clientFingerprint }
        }, transaction);

        // 6. Verifica se TODOS os signatários já assinaram
        const signersInDoc = await Signer.findAll({ where: { documentId: document.id }, transaction });
        const allSigned = signersInDoc.every(s => s.status === 'SIGNED');

        if (allSigned) {
            console.log(`[FINALIZE] Documento ${document.id} finalizado. Gerando PDF final...`);
            
            // 6a. Gera o PDF Final com as imagens das assinaturas embutidas
            const originalFilePath = path.join(__dirname, '..', '..', '..', document.storageKey);
            
            // Usa o pdfService para carimbar o PDF
            const signedPdfBuffer = await pdfService.embedSignatures(originalFilePath, signersInDoc);
            
            // Define caminho do novo arquivo
            const signedFileStorageKey = document.storageKey.replace(/(\.[\w\d_-]+)$/i, '-signed$1');
            const signedFilePath = path.join(__dirname, '..', '..', '..', signedFileStorageKey);
            await fs.writeFile(signedFilePath, signedPdfBuffer);

            // 6b. Calcula novo Hash do documento final
            const newSha256 = crypto.createHash('sha256').update(signedPdfBuffer).digest('hex');
            
            // 6c. Atualiza status do Documento
            document.status = 'SIGNED';
            document.storageKey = signedFileStorageKey;
            document.sha256 = newSha256;
            await document.save({ transaction });

            await auditService.createEntry({ 
                tenantId: document.tenantId, 
                actorKind: 'SYSTEM', 
                entityType: 'DOCUMENT', 
                entityId: document.id, 
                action: 'STATUS_CHANGED', 
                payload: { newStatus: 'SIGNED', newSha256 }
            }, transaction);

            // 6d. Gera Registro de Certificado (Mock de conteúdo por enquanto)
            // Futuramente: Gerar um PDF real de "Manifesto de Assinaturas"
            const certificateSha256 = crypto.createHash('sha256').update(`CERT-${document.id}-${timestampISO}`).digest('hex');
            
            await Certificate.create({
                documentId: document.id,
                storageKey: `certificates/${document.id}.pdf`, 
                sha256: certificateSha256,
                issuedAt: new Date()
            }, { transaction });

            await auditService.createEntry({ 
                tenantId: document.tenantId, 
                actorKind: 'SYSTEM', 
                entityType: 'DOCUMENT', 
                entityId: document.id, 
                action: 'CERTIFICATE_ISSUED'
            }, transaction);

            // 6e. Dispara E-mails de Conclusão (Fora da transação idealmente, mas aqui para simplificar)
            // Envia para o Dono
            const owner = await User.findByPk(document.ownerId, { transaction });
            if (owner) {
                // Não usamos await para não bloquear o response se o email demorar
                notificationService.sendEmail(document.tenantId, {
                    to: owner.email,
                    subject: `Documento Finalizado: ${document.title}`,
                    html: `<p>O documento <strong>${document.title}</strong> foi assinado por todos.</p><p>Acesse o painel para baixar o arquivo assinado e o certificado.</p>`
                }).catch(console.error);
            }
            
            // Envia para os Signatários
            signersInDoc.forEach(s => {
                 if (s.email) {
                    notificationService.sendEmail(document.tenantId, {
                        to: s.email,
                        subject: `Cópia do Documento: ${document.title}`,
                        html: `<p>Olá ${s.name}, o processo de assinatura foi concluído. Em breve você receberá sua cópia.</p>`
                    }).catch(console.error);
                 }
            });
        }

        await transaction.commit();

        // Retorna dados para o Frontend exibir na tela de sucesso
        resultData = {
            shortCode,
            signatureHash,
            isComplete: allSigned
        };

    } catch (error) {
        await transaction.rollback();
        console.error("Erro commitSignature:", error);
        throw error;
    }

    return resultData;
};

module.exports = {
  getSignerSummary,
  identifySigner,
  startOtpVerification,
  verifyOtp,
  commitSignature,
  saveSignaturePosition,
};