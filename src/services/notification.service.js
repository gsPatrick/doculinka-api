// src/services/notification.service.js
'use strict';

const axios = require('axios');
const { Resend } = require('resend');
const { TenantSettings } = require('../models');

// --- FUNÇÕES AUXILIARES ---

const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length >= 10 && digitsOnly.length <= 11) {
    return `55${digitsOnly}`;
  }
  return digitsOnly;
};

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
    resendApiKey: (settings?.resendActive && settings?.resendApiKey) 
      ? settings.resendApiKey 
      : process.env.RESEND_API_KEY,
    
    resendFrom: process.env.RESEND_FROM_EMAIL || 'nao-responda@doculink.com.br',

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

// --- CORE ---

const sendEmail = async (tenantId, { to, subject, html }) => {
  try {
    const creds = await getCredentials(tenantId);

    if (!creds.resendApiKey) {
      console.warn(`[Resend] Nenhuma chave de API configurada. Email não enviado.`);
      return;
    }

    const resendClient = new Resend(creds.resendApiKey);

    await resendClient.emails.send({
      from: creds.resendFrom,
      to,
      subject,
      html
    });

    console.log(`[Resend] E-mail enviado para ${to}`);
  } catch (error) {
    console.error(`[Resend] Falha ao enviar para ${to}:`, error.response?.data || error.message);
  }
};

const sendWhatsAppText = async (tenantId, { phone, message }) => {
  const formattedPhone = formatPhoneNumber(phone);
  if (!formattedPhone) return;

  try {
    const creds = await getCredentials(tenantId);

    if (!creds.zapiInstance || !creds.zapiToken) return;

    const url = `https://api.z-api.io/instances/${creds.zapiInstance}/token/${creds.zapiToken}/send-text`;

    await axios.post(
      url, 
      { phone: formattedPhone, message: message }, 
      { headers: { 'Content-Type': 'application/json', 'Client-Token': creds.zapiClientToken } }
    );
    console.log(`[Z-API] WhatsApp enviado para ${formattedPhone}`);
  } catch (error) {
    console.error(`[Z-API] Falha ao enviar para ${formattedPhone}:`, error.response?.data || error.message);
  }
};

// --- FUNÇÕES DE NEGÓCIO ---

const sendSignInvite = async (signer, token, customMessage, tenantId) => {
  const inviteLink = `${process.env.FRONT_URL}/sign/${token}`;
  
  const messageText = customMessage 
    ? `${customMessage}\n\nAcesse para assinar: ${inviteLink}` 
    : `Olá ${signer.name}, você foi convidado para assinar um documento.\n\nAcesse: ${inviteLink}`;

  const messageHtml = `
    <div style="font-family: sans-serif; color: #333;">
      <h2>Olá, ${signer.name}</h2>
      <p>${customMessage || 'Você foi convidado para assinar um documento digitalmente.'}</p>
      <p style="margin: 20px 0;">
        <a href="${inviteLink}" style="background-color: #2563EB; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
          Assinar Documento
        </a>
      </p>
    </div>
  `;

  const channels = Array.isArray(signer.authChannels) ? signer.authChannels : [];
  const promises = [];

  if (channels.includes('EMAIL') && signer.email) {
    promises.push(sendEmail(tenantId, { to: signer.email, subject: 'Convite para assinatura', html: messageHtml }));
  }
  if (channels.includes('WHATSAPP') && signer.phoneWhatsE164) {
    promises.push(sendWhatsAppText(tenantId, { phone: signer.phoneWhatsE164, message: messageText }));
  }

  await Promise.all(promises);
};

const sendOtp = async (recipient, channel, otp, tenantId) => {
  if (channel === 'EMAIL') {
    await sendEmail(tenantId, {
      to: recipient,
      subject: 'Seu código de verificação',
      html: `<h3>Seu código é:</h3><h1>${otp}</h1>`
    });
  } else if (channel === 'WHATSAPP') {
    await sendWhatsAppText(tenantId, {
      phone: recipient,
      message: `Seu código de verificação é: *${otp}*`
    });
  }
};

/**
 * NOVO: Envia convite para membro da equipe.
 */
const sendTeamInvitation = async (user, token, tenantName) => {
  // Link para o frontend onde a pessoa define a senha
  const inviteLink = `${process.env.FRONT_URL}/accept-invite?token=${token}`;

  const html = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
      <h2>Convite para Doculink</h2>
      <p>Olá, <strong>${user.name}</strong>.</p>
      <p>Você foi convidado para fazer parte da organização <strong>${tenantName}</strong> no Doculink.</p>
      <p>Para aceitar o convite e definir sua senha de acesso, clique no botão abaixo:</p>
      <p style="margin: 30px 0;">
        <a href="${inviteLink}" style="background-color: #2563EB; color: white; padding: 14px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
          Aceitar Convite
        </a>
      </p>
      <p style="font-size: 12px; color: #666;">Se você não esperava este convite, pode ignorar este e-mail.</p>
    </div>
  `;

  await sendEmail(user.tenantId, {
    to: user.email,
    subject: `Convite para juntar-se a ${tenantName}`,
    html
  });
};

module.exports = {
  sendSignInvite,
  sendOtp,
  sendTeamInvitation, // Exporta a nova função
  formatPhoneNumber
};