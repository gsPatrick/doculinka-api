// src/services/notification.service.js
'use strict';

const axios = require('axios');
const { Resend } = require('resend');
const { TenantSettings } = require('../models');

// --- FUNÇÕES AUXILIARES ---

/**
 * Formata um número de telefone para o padrão internacional (apenas números).
 * Ex: (11) 99999-9999 -> 5511999999999
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  // Remove tudo que não é dígito
  const digitsOnly = phone.replace(/\D/g, '');
  
  // Lógica específica para Brasil (se tiver 10 ou 11 dígitos, adiciona 55)
  if (digitsOnly.length >= 10 && digitsOnly.length <= 11) {
    return `55${digitsOnly}`;
  }
  
  return digitsOnly;
};

/**
 * Obtém as credenciais de envio (Whitelabel).
 * Prioriza as configurações do banco de dados do Tenant.
 * Se não encontrar ou estiver inativo, usa as variáveis de ambiente (.env).
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

  return {
    // Email (Resend)
    resendApiKey: (settings?.resendActive && settings?.resendApiKey) 
      ? settings.resendApiKey 
      : process.env.RESEND_API_KEY,
    
    // O remetente padrão. Se usar Resend grátis, só funciona 'onboarding@resend.dev' para seu email.
    // Em produção, deve ser um domínio verificado (ex: nao-responda@suaempresa.com).
    resendFrom: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',

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
 * Envia um e-mail utilizando a API do Resend.
 */
const sendEmail = async (tenantId, { to, subject, html }) => {
  try {
    const creds = await getCredentials(tenantId);

    if (!creds.resendApiKey) {
      console.warn(`[Resend] PULA: Nenhuma chave de API configurada (Tenant: ${tenantId || 'Global'}).`);
      return;
    }

    const resendClient = new Resend(creds.resendApiKey);

    const { data, error } = await resendClient.emails.send({
      from: creds.resendFrom,
      to,
      subject,
      html
    });

    if (error) {
      console.error(`[Resend] ERRO API ao enviar para ${to}:`, error);
      return;
    }

    console.log(`[Resend] E-mail enviado com sucesso para ${to}. ID: ${data?.id}`);

  } catch (error) {
    console.error(`[Resend] FALHA CRÍTICA ao enviar para ${to}:`, error.message);
  }
};

/**
 * Envia uma mensagem de texto via WhatsApp (Z-API).
 */
const sendWhatsAppText = async (tenantId, { phone, message }) => {
  const formattedPhone = formatPhoneNumber(phone);
  
  if (!formattedPhone) {
    console.warn('[Z-API] Número de telefone inválido/vazio. Ignorando envio.');
    return;
  }

  try {
    const creds = await getCredentials(tenantId);

    if (!creds.zapiInstance || !creds.zapiToken) {
      console.warn(`[Z-API] PULA: Credenciais incompletas (Tenant: ${tenantId || 'Global'}).`);
      return;
    }

    // URL da Z-API
    const url = `https://api.z-api.io/instances/${creds.zapiInstance}/token/${creds.zapiToken}/send-text`;

    const payload = {
      phone: formattedPhone,
      message: message
    };

    const headers = {
      'Content-Type': 'application/json',
      'Client-Token': creds.zapiClientToken
    };

    const response = await axios.post(url, payload, { headers });

    // Verifica se a API retornou sucesso lógico (algumas retornam 200 mesmo com erro interno)
    if (response.data && response.data.error) {
        console.error(`[Z-API] ERRO LÓGICO da API para ${formattedPhone}:`, response.data);
    } else {
        console.log(`[Z-API] WhatsApp enviado para ${formattedPhone}. MsgID: ${response.data?.messageId}`);
    }

  } catch (error) {
    // Captura erros de rede ou status code != 2xx
    if (error.response) {
        console.error(`[Z-API] ERRO HTTP ${error.response.status} para ${formattedPhone}:`, error.response.data);
    } else {
        console.error(`[Z-API] FALHA DE REDE/CÓDIGO para ${formattedPhone}:`, error.message);
    }
  }
};


// --- FUNÇÕES DE NEGÓCIO (PÚBLICAS) ---

/**
 * Envia o convite de assinatura para os canais configurados.
 */
const sendSignInvite = async (signer, token, customMessage, tenantId) => {
  const inviteLink = `${process.env.FRONT_URL}/sign/${token}`;
  
  // Mensagem Texto (WhatsApp)
  const defaultMessageText = `Olá ${signer.name}, você foi convidado para assinar um documento.\n\nAcesse o link: ${inviteLink}`;
  const messageText = customMessage 
    ? `${customMessage}\n\nAcesse para assinar: ${inviteLink}` 
    : defaultMessageText;

  // Mensagem HTML (Email)
  const messageHtml = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px;">
      <h2>Olá, ${signer.name}</h2>
      <p>Você foi convidado para assinar um documento digitalmente.</p>
      ${customMessage ? `<p style="background: #f3f4f6; padding: 10px; border-left: 4px solid #2563EB;">${customMessage}</p>` : ''}
      <p style="margin: 30px 0;">
        <a href="${inviteLink}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Acessar Documento
        </a>
      </p>
      <p style="font-size: 12px; color: #666;">Ou copie e cole: ${inviteLink}</p>
    </div>
  `;

  const channels = Array.isArray(signer.authChannels) ? signer.authChannels : ['EMAIL'];

  console.log(`[Notification] Processando convite para ${signer.email || 'sem email'} / ${signer.phoneWhatsE164 || 'sem fone'}...`);

  const promises = [];

  if (channels.includes('EMAIL') && signer.email) {
    promises.push(sendEmail(tenantId, {
      to: signer.email,
      subject: 'Convite para assinatura',
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
 */
const sendOtp = async (recipient, channel, otp, tenantId) => {
  console.log(`[Notification] Enviando OTP ${otp} via ${channel} para ${recipient}`);

  if (channel === 'EMAIL') {
    await sendEmail(tenantId, {
      to: recipient,
      subject: 'Seu código de verificação',
      html: `
        <div style="font-family: sans-serif; text-align: center; padding: 20px;">
          <h3>Código de Segurança</h3>
          <p>Seu código de verificação é:</p>
          <h1 style="letter-spacing: 8px; background: #f0f0f0; display: inline-block; padding: 10px 20px; border-radius: 8px;">${otp}</h1>
          <p>Este código expira em 10 minutos.</p>
        </div>
      `
    });
  } else if (channel === 'WHATSAPP') {
    await sendWhatsAppText(tenantId, {
      phone: recipient,
      message: `Seu código de verificação Doculink é: *${otp}*.\n\nVálido por 10 minutos. Não compartilhe.`
    });
  }
};

module.exports = {
  sendSignInvite,
  sendOtp,
  formatPhoneNumber
};