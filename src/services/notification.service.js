// src/services/notification.service.js
'use strict';

const axios = require('axios');
const { Resend } = require('resend');

// --- Configuração dos Clientes de API ---

// 1. Cliente Resend (para e-mails)
const resend = new Resend(process.env.RESEND_API_KEY);

// 2. Cliente Axios para a Z-API (com Client-Token)
const zapiClient = axios.create({
  baseURL: `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}`,
  headers: {
    'Content-Type': 'application/json',
    'Client-Token': process.env.ZAPI_CLIENT_TOKEN
  }
});


// --- Funções Auxiliares ---

/**
 * Formata um número de telefone para o padrão E.164 (DDI+DDD+Número).
 * @param {string} phone - O número de telefone com máscara (ex: "(71) 98314-1335").
 * @returns {string} - O número formatado (ex: "5571983141335").
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length <= 11) {
    return `55${digitsOnly}`;
  }
  return digitsOnly;
};


// --- Funções de Envio Reais ---

/**
 * Envia um e-mail usando a API do Resend.
 */
const sendEmail = async ({ to, subject, html }) => {
  try {
    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) {
        console.error('[Resend] Variável de ambiente RESEND_FROM_EMAIL não configurada.');
        return;
    }
    await resend.emails.send({ from, to, subject, html });
    console.log(`[Resend] E-mail enviado com sucesso para: ${to}`);
  } catch (error) {
    console.error(`[Resend] Erro ao enviar e-mail para ${to}:`, error.response?.data || error.message);
  }
};

/**
 * Envia uma mensagem de texto via WhatsApp usando a Z-API.
 */
const sendWhatsAppText = async ({ phone, message }) => {
  const formattedPhone = formatPhoneNumber(phone);
  if (!formattedPhone) {
    console.error('[Z-API] Tentativa de envio para um número de telefone nulo ou inválido.');
    return;
  }

  try {
    console.log(`[Z-API] Enviando mensagem para ${formattedPhone}...`);
    const response = await zapiClient.post('/send-text', {
      phone: formattedPhone,
      message: message
    });
    console.log(`[Z-API] Mensagem enviada com sucesso! Z-API ID: ${response.data.zaapId}`);
  } catch (error) {
    console.error(`[Z-API] Erro ao enviar mensagem para ${formattedPhone}:`, error.response?.data || error.message);
  }
};


// --- Funções de Negócio (Exportadas) ---

/**
 * Envia o convite de assinatura, respeitando os canais de autenticação definidos.
 * @param {object} signer - O objeto do signatário (com a propriedade 'authChannels').
 * @param {string} token - O token de acesso para o link de assinatura.
 * @param {string} [customMessage] - A mensagem personalizada opcional.
 */
const sendSignInvite = async (signer, token, customMessage) => {
  const inviteLink = `${process.env.FRONT_URL}/sign/${token}`;
  
  const defaultMessageText = `Olá ${signer.name}, você foi convidado para assinar um documento no Doculink.\n\nAcesse o link: ${inviteLink}`;
  const defaultMessageHtml = `Olá ${signer.name},<br><br>Você foi convidado para assinar um documento. Acesse o link:<br><a href="${inviteLink}">${inviteLink}</a>`;

  const messageText = customMessage ? `${customMessage}\n\nAcesse o link para assinar:\n${inviteLink}` : defaultMessageText;
  const messageHtml = customMessage ? `${customMessage.replace(/\n/g, '<br>')}<br><br>Acesse o link para assinar:<br><a href="${inviteLink}">${inviteLink}</a>` : defaultMessageHtml;
  
  const channels = Array.isArray(signer.authChannels) ? signer.authChannels : [];
  
  console.log(`[Notification] Enviando convite para ${signer.email} pelos canais: ${channels.join(', ')}`);

  // Itera sobre os canais definidos e envia para cada um
  for (const channel of channels) {
    if (channel === 'EMAIL' && signer.email) {
      await sendEmail({
        to: signer.email,
        subject: 'Convite para assinatura de documento',
        html: messageHtml,
      });
    }
    
    if (channel === 'WHATSAPP' && signer.phoneWhatsE164) {
      await sendWhatsAppText({
        phone: signer.phoneWhatsE164,
        message: messageText,
      });
    }
  }
};

/**
 * Envia o código OTP para o canal especificado.
 */
const sendOtp = async (recipient, channel, otp) => {
  if (channel === 'EMAIL') {
    await sendEmail({
      to: recipient,
      subject: 'Seu código de verificação Doculink',
      html: `Seu código de verificação é: <strong>${otp}</strong>.<br>Ele é válido por 10 minutos.`
    });
  }
  
  if (channel === 'WHATSAPP') {
    await sendWhatsAppText({
      phone: recipient,
      message: `Seu código de verificação Doculink é: *${otp}*. Ele expira em 10 minutos.`
    });
  }
};

module.exports = {
  sendSignInvite,
  sendOtp
};