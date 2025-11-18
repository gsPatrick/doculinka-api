// src/services/notification.service.js
'use strict';

const axios = require('axios');
const { Resend } = require('resend');
const { TenantSettings } = require('../models'); // Importa o modelo de configurações

// --- FUNÇÕES AUXILIARES ---

/**
 * Formata um número de telefone para o padrão E.164 (DDI+DDD+Número).
 * Remove caracteres não numéricos e adiciona o 55 se necessário.
 * @param {string} phone - O número de telefone (ex: "(71) 98888-7777").
 * @returns {string|null} - O número formatado (ex: "5571988887777") ou null.
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  const digitsOnly = phone.replace(/\D/g, '');
  
  // Se tiver 10 ou 11 dígitos, assume que é BR e adiciona 55
  if (digitsOnly.length >= 10 && digitsOnly.length <= 11) {
    return `55${digitsOnly}`;
  }
  // Se já tiver 12 ou 13 (ex: 55...), retorna como está
  return digitsOnly;
};

/**
 * Obtém as credenciais de envio (Whitelabel).
 * Prioriza as configurações do banco de dados do Tenant.
 * Se não encontrar ou estiver inativo, usa as variáveis de ambiente (.env).
 * 
 * @param {string} tenantId - ID do tenant que está disparando a ação.
 */
const getCredentials = async (tenantId) => {
  let settings = null;
  
  if (tenantId) {
    try {
      settings = await TenantSettings.findOne({ where: { tenantId } });
    } catch (error) {
      console.error(`[Notification] Erro ao buscar configurações do tenant ${tenantId}:`, error.message);
    }
  }

  // Lógica de Fallback: Banco de Dados -> Variáveis de Ambiente
  return {
    // Email (Resend)
    resendApiKey: (settings?.resendActive && settings?.resendApiKey) 
      ? settings.resendApiKey 
      : process.env.RESEND_API_KEY,
    
    // O remetente geralmente precisa ser verificado na plataforma de email.
    // Se o cliente usar a chave dele, ele deve ter configurado o domínio dele.
    // Por segurança, podemos manter um padrão ou tentar pegar do settings se houver campo 'fromEmail' futuro.
    resendFrom: process.env.RESEND_FROM_EMAIL || 'nao-responda@doculink.com.br',

    // WhatsApp (Z-API)
    zapiInstance: (settings?.zapiActive && settings?.zapiInstanceId) 
      ? settings.zapiInstanceId 
      : process.env.ZAPI_INSTANCE_ID,
      
    zapiToken: (settings?.zapiActive && settings?.zapiToken) 
      ? settings.zapiToken 
      : process.env.ZAPI_TOKEN,
      
    zapiClientToken: (settings?.zapiActive && settings?.zapiClientToken) 
      ? settings.zapiClientToken 
      : process.env.ZAPI_CLIENT_TOKEN,
  };
};

// --- FUNÇÕES DE ENVIO (CORE) ---

/**
 * Envia um e-mail utilizando a API do Resend com credenciais dinâmicas.
 */
const sendEmail = async (tenantId, { to, subject, html }) => {
  try {
    const creds = await getCredentials(tenantId);

    if (!creds.resendApiKey) {
      console.warn(`[Resend] Nenhuma chave de API configurada (Tenant: ${tenantId || 'Global'}). Email não enviado.`);
      return;
    }

    // Instancia o cliente Resend com a chave específica desta chamada
    const resendClient = new Resend(creds.resendApiKey);

    await resendClient.emails.send({
      from: creds.resendFrom,
      to,
      subject,
      html
    });

    console.log(`[Resend] E-mail enviado para ${to} (Tenant: ${tenantId || 'Global'})`);
  } catch (error) {
    console.error(`[Resend] Falha ao enviar para ${to}:`, error.response?.data || error.message);
  }
};

/**
 * Envia uma mensagem de texto via WhatsApp (Z-API) com credenciais dinâmicas.
 */
const sendWhatsAppText = async (tenantId, { phone, message }) => {
  const formattedPhone = formatPhoneNumber(phone);
  if (!formattedPhone) {
    console.warn('[Z-API] Número de telefone inválido ou vazio.');
    return;
  }

  try {
    const creds = await getCredentials(tenantId);

    if (!creds.zapiInstance || !creds.zapiToken) {
      console.warn(`[Z-API] Credenciais incompletas (Tenant: ${tenantId || 'Global'}). WhatsApp não enviado.`);
      return;
    }

    // Constrói a URL dinâmica baseada na instância
    const url = `https://api.z-api.io/instances/${creds.zapiInstance}/token/${creds.zapiToken}/send-text`;

    await axios.post(
      url, 
      {
        phone: formattedPhone,
        message: message
      }, 
      {
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': creds.zapiClientToken
        }
      }
    );

    console.log(`[Z-API] WhatsApp enviado para ${formattedPhone} (Tenant: ${tenantId || 'Global'})`);
  } catch (error) {
    console.error(`[Z-API] Falha ao enviar para ${formattedPhone}:`, error.response?.data || error.message);
  }
};


// --- FUNÇÕES DE NEGÓCIO (PÚBLICAS) ---

/**
 * Envia o convite de assinatura para os canais configurados no signatário.
 * 
 * @param {object} signer - Objeto do signatário (contém name, email, phone, authChannels).
 * @param {string} token - O token único para o link de assinatura.
 * @param {string} [customMessage] - Mensagem personalizada opcional.
 * @param {string} tenantId - ID do Tenant (obrigatório para carregar configurações corretas).
 */
const sendSignInvite = async (signer, token, customMessage, tenantId) => {
  // URL do Frontend
  const inviteLink = `${process.env.FRONT_URL}/sign/${token}`;
  
  // Mensagem Texto (WhatsApp/SMS)
  const defaultMessageText = `Olá ${signer.name}, você foi convidado para assinar um documento.\n\nAcesse o link: ${inviteLink}`;
  const messageText = customMessage 
    ? `${customMessage}\n\nAcesse para assinar: ${inviteLink}` 
    : defaultMessageText;

  // Mensagem HTML (Email)
  // Nota: Em produção, use templates de email (handlebars/ejs)
  const defaultMessageHtml = `
    <div style="font-family: sans-serif; color: #333;">
      <h2>Olá, ${signer.name}</h2>
      <p>Você foi convidado para assinar um documento digitalmente.</p>
      <p style="margin: 20px 0;">
        <a href="${inviteLink}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Assinar Documento
        </a>
      </p>
      <p><small>Ou copie e cole: ${inviteLink}</small></p>
    </div>
  `;
  
  const messageHtml = customMessage 
    ? `<div style="font-family: sans-serif; color: #333;">
         <h2>Convite para Assinatura</h2>
         <p>${customMessage.replace(/\n/g, '<br>')}</p>
         <p style="margin: 20px 0;">
           <a href="${inviteLink}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
             Acessar Documento
           </a>
         </p>
       </div>`
    : defaultMessageHtml;

  const channels = Array.isArray(signer.authChannels) ? signer.authChannels : [];

  console.log(`[Notification] Iniciando envio de convite para ${signer.email || signer.name} (Tenant: ${tenantId})`);

  // Disparo paralelo para os canais
  const promises = [];

  if (channels.includes('EMAIL') && signer.email) {
    promises.push(sendEmail(tenantId, {
      to: signer.email,
      subject: 'Convite para assinatura de documento',
      html: messageHtml
    }));
  }

  if (channels.includes('WHATSAPP') && signer.phoneWhatsE164) {
    promises.push(sendWhatsAppText(tenantId, {
      phone: signer.phoneWhatsE164,
      message: messageText
    }));
  }

  await Promise.all(promises);
};

/**
 * Envia o código OTP para validação de identidade.
 * 
 * @param {string} recipient - Email ou Telefone destino.
 * @param {string} channel - 'EMAIL' ou 'WHATSAPP'.
 * @param {string} otp - O código de 6 dígitos.
 * @param {string} tenantId - ID do Tenant.
 */
const sendOtp = async (recipient, channel, otp, tenantId) => {
  if (channel === 'EMAIL') {
    await sendEmail(tenantId, {
      to: recipient,
      subject: 'Seu código de verificação',
      html: `
        <div style="font-family: sans-serif; text-align: center;">
          <h3>Código de Segurança</h3>
          <p>Seu código de verificação é:</p>
          <h1 style="letter-spacing: 5px; color: #333;">${otp}</h1>
          <p>Este código expira em 10 minutos.</p>
        </div>
      `
    });
  } else if (channel === 'WHATSAPP') {
    await sendWhatsAppText(tenantId, {
      phone: recipient,
      message: `Seu código de verificação é: *${otp}*. Válido por 10 minutos.`
    });
  }
};

module.exports = {
  sendSignInvite,
  sendOtp,
  // Exportamos formatPhoneNumber caso precise ser usado em outros lugares
  formatPhoneNumber
};