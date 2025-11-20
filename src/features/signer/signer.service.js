// src/features/signer/signer.service.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// Importa Modelos
const { Document, Signer, OtpCode, Certificate, User, sequelize } = require('../../models');

// Importa Serviços
const notificationService = require('../../services/notification.service');
const auditService = require('../audit/audit.service');
const documentService = require('../document/document.service');
const pdfService = require('../../services/pdf.service');

/**
 * Salva a imagem da assinatura (em Base64) como um arquivo PNG no disco.
 */
const saveSignatureImage = async (base64Image, tenantId, signerId) => {
  if (!base64Image) {
    throw new Error("Imagem da assinatura (Base64) não fornecida.");
  }
  // Remove o cabeçalho data:image/png;base64 se existir
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, 'base64');
  
  // Caminho: uploads/{tenantId}/signatures/
  const dir = path.join(__dirname, '..', '..', '..', 'uploads', tenantId, 'signatures');
  await fs.mkdir(dir, { recursive: true });
  
  const filePath = path.join(dir, `${signerId}.png`);
  await fs.writeFile(filePath, imageBuffer);
  
  // Retorna caminho relativo para salvar no banco
  return path.relative(path.join(__dirname, '..', '..', '..'), filePath);
};

/**
 * Obtém o resumo do documento para o signatário, incluindo a URL para visualização.
 */
const getSignerSummary = async (document, signer, req) => {
  // Se for a primeira vez que ele abre, marca como VIEWED
  if (signer.status === 'PENDING') {
    signer.status = 'VIEWED';
    await signer.save();
    
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
  
  // Gera URL temporária/pública para o PDF
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
  // Gera código numérico de 6 dígitos
  const otp = crypto.randomInt(100000, 999999).toString();
  const codeHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Validade 10 minutos

  // Envia para todos os canais configurados
  for (const channel of signer.authChannels) {
    const recipient = channel === 'EMAIL' ? signer.email : signer.phoneWhatsE164;
    if (!recipient) continue;

    // Salva o hash do código no banco
    await OtpCode.create({ recipient, channel, codeHash, expiresAt, context: 'SIGNING' });
    
    // Envia a mensagem real
    await notificationService.sendOtp(recipient, channel, otp, req.document.tenantId);
    
    // Auditoria
    await auditService.createEntry({
        tenantId: req.document.tenantId,
        actorKind: 'SYSTEM',
        entityType: 'OTP',
        entityId: signer.id,
        action: 'OTP_SENT',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        payload: { channel, recipient: recipient.replace(/(?<=^.{2}).*(?=@)/, '***') } // Mascara email no log
    });
  }
};

/**
 * Verifica o código OTP fornecido pelo usuário.
 */
const verifyOtp = async (signer, otp, req) => {
    const recipients = [signer.email, signer.phoneWhatsE164].filter(Boolean);
    
    // Busca o último código válido para este usuário
    const otpRecord = await OtpCode.findOne({
      where: { recipient: recipients, context: 'SIGNING' },
      order: [['createdAt', 'DESC']]
    });

    if (!otpRecord || new Date() > new Date(otpRecord.expiresAt)) {
        await auditService.createEntry({
            tenantId: req.document.tenantId,
            actorKind: 'SIGNER',
            actorId: signer.id,
            entityType: 'OTP',
            entityId: signer.id,
            action: 'OTP_FAILED',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            payload: { reason: 'Expired or not found' }
        });
        throw new Error('Código OTP inválido ou expirado.');
    }

    const isMatch = await bcrypt.compare(otp, otpRecord.codeHash);
    if (!isMatch) {
        await auditService.createEntry({
            tenantId: req.document.tenantId,
            actorKind: 'SIGNER',
            actorId: signer.id,
            entityType: 'OTP',
            entityId: signer.id,
            action: 'OTP_FAILED',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            payload: { reason: 'Wrong code' }
        });
        throw new Error('Código OTP inválido.');
    }

    // Sucesso
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
    
    // Remove o código usado para evitar reuso
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
 * Gera Hash, salva imagem, verifica conclusão do documento e envia e-mails.
 */
const commitSignature = async (document, signer, clientFingerprint, signatureImageBase64, req) => {
    const transaction = await sequelize.transaction();
    let resultData = {};

    try {
        const timestampISO = new Date().toISOString();
        
        // 1. Gera o Hash SHA256 único desta assinatura
        const signatureHash = crypto.createHash('sha256')
            .update(document.sha256 + signer.id + timestampISO + clientFingerprint)
            .digest('hex');
        
        // 2. Gera um Código Curto (Protocolo) para exibição ao usuário (Ex: "AF3D91")
        const shortCode = signatureHash.substring(0, 6).toUpperCase();

        // 3. Salva a imagem da assinatura
        const artefactPath = await saveSignatureImage(signatureImageBase64, document.tenantId, signer.id);

        // 4. Atualiza o Signatário
        signer.status = 'SIGNED';
        signer.signedAt = new Date();
        signer.signatureHash = signatureHash;
        signer.signatureArtefactPath = artefactPath;
        await signer.save({ transaction });

        // 5. Log de Auditoria
        await auditService.createEntry({
            tenantId: document.tenantId,
            actorKind: 'SIGNER',
            actorId: signer.id,
            entityType: 'DOCUMENT',
            entityId: document.id,
            action: 'SIGNED',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            payload: { signatureHash, shortCode, artefactPath }
        }, transaction);

        // 6. Verifica se TODOS os signatários já assinaram
        const signersInDoc = await Signer.findAll({ where: { documentId: document.id }, transaction });
        const allSigned = signersInDoc.every(s => s.status === 'SIGNED');

        if (allSigned) {
            console.log(`[FINALIZE] Todos assinaram o doc ${document.id}. Gerando PDF final...`);
            
            // A. Processamento do PDF: Embutir imagens de assinatura
            const originalFilePath = path.join(__dirname, '..', '..', '..', document.storageKey);
            const signedPdfBuffer = await pdfService.embedSignatures(originalFilePath, signersInDoc);
            
            const signedFileStorageKey = document.storageKey.replace(/(\.[\w\d_-]+)$/i, '-signed$1');
            const signedFilePath = path.join(__dirname, '..', '..', '..', signedFileStorageKey);
            await fs.writeFile(signedFilePath, signedPdfBuffer);

            // B. Atualiza Documento (Novo Hash e Status)
            const newSha256 = crypto.createHash('sha256').update(signedPdfBuffer).digest('hex');

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
                payload: { newStatus: 'SIGNED' }
            }, transaction);

            // C. Gera Certificado (Registro no Banco)
            // Futuramente: Gerar PDF do manifesto aqui
            const certificateSha256 = crypto.createHash('sha256').update('mock_content_certificado').digest('hex');
            
            await Certificate.create({
                documentId: document.id,
                storageKey: `certificates/${document.id}.pdf`,
                sha256: certificateSha256
            }, { transaction });

            await auditService.createEntry({ 
                tenantId: document.tenantId, 
                actorKind: 'SYSTEM', 
                entityType: 'DOCUMENT', 
                entityId: document.id, 
                action: 'CERTIFICATE_ISSUED'
            }, transaction);

            // D. Disparo de E-mails Finais (Notificação de Conclusão)
            // Buscamos o Owner para notificar
            const owner = await User.findByPk(document.ownerId, { transaction });
            
            // Dica: Disparos de e-mail devem ser feitos FORA da transação para não bloquear o banco se o SMTP demorar.
            // Porém, aqui coletamos os dados para disparar logo após o commit.
            
            // Vamos disparar de forma assíncrona sem await para não travar a resposta
            (async () => {
                try {
                    // Notifica Dono
                    if (owner) {
                        await notificationService.sendEmail(document.tenantId, {
                           to: owner.email,
                           subject: `Documento Finalizado: ${document.title}`,
                           html: `
                             <h3>O documento foi finalizado com sucesso!</h3>
                             <p>Todos os signatários assinaram.</p>
                             <p>Acesse a plataforma para baixar o arquivo assinado e o certificado.</p>
                           `
                        });
                    }
                    
                    // Notifica Signatários
                    for (const s of signersInDoc) {
                        if (s.email) {
                             await notificationService.sendEmail(document.tenantId, {
                                to: s.email,
                                subject: `Cópia do Documento Assinado: ${document.title}`,
                                html: `
                                  <h3>Olá ${s.name},</h3>
                                  <p>O processo de assinatura foi concluído.</p>
                                  <p>Em anexo, você encontraria a cópia do documento. (Link para download na plataforma).</p>
                                `
                             });
                        }
                    }
                } catch (emailErr) {
                    console.error("Erro ao enviar e-mails finais:", emailErr);
                }
            })();
        }

        await transaction.commit();

        // Prepara dados de retorno para o Frontend
        resultData = {
            shortCode,
            signatureHash,
            isComplete: allSigned
        };

    } catch (error) {
        await transaction.rollback();
        console.error("Erro durante o commit da assinatura:", error);
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