// src/services/notification.service.js
'use strict';

const axios = require('axios');
const { Resend } = require('resend');

// --- Configuração dos Clientes de API ---

// 1. Cliente Resend (para e-mails)
const resend = new Resend(process.env.RESEND_API_KEY);

// 2. Cliente Axios para a Z-API (para WhatsApp)
const zapiClient = axios.create({
  baseURL: `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}`,
  headers: {
    'Content-Type': 'application/json',
    'Client-Token': process.env.ZAPI_CLIENT_TOKEN // Header obrigatório
  }
});

// --- Funções Auxiliares ---

/**
 * Formata um número de telefone para o padrão E.164 (DDI+DDD+Número), removendo todos os caracteres não numéricos.
 * Ex: "(71) 98314-1335" -> "5571983141335" (assumindo DDI 55)
 * @param {string} phone - O número de telefone com máscara.
 * @returns {string} - O número formatado.
 */
const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  const digitsOnly = phone.replace(/\D/g, '');
  // Adiciona o DDI do Brasil (55) se não estiver presente.
  // Adapte se você precisar de outros DDIs.
  if (digitsOnly.length <= 11) {
    return `55${digitsOnly}`;
  }
  return digitsOnly;
};


// --- Funções de Envio Reais ---

const sendEmail = async ({ to, subject, html }) => {
  try {
    const from = process.env.RESEND_FROM_EMAIL;
    await resend.emails.send({ from, to, subject, html });
    console.log(`[Resend] E-mail enviado com sucesso para: ${to}`);
  } catch (error) {
    console.error(`[Resend] Erro ao enviar e-mail para ${to}:`, error.response?.data || error.message);
  }
};

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

const sendSignInvite = async (signer, token) => {
  const inviteLink = `${process.env.FRONT_URL}/sign/${token}`;
  
  // Envia o e-mail de convite
  await sendEmail({
    to: signer.email,
    subject: 'Você foi convidado para assinar um documento',
    html: `Olá ${signer.name},<br><br>Por favor, acesse o link abaixo para visualizar e assinar o documento:<br><a href="${inviteLink}">${inviteLink}</a>`
  });

  // Se o signatário tiver WhatsApp, envia também
  if (signer.phoneWhatsE164) {
    await sendWhatsAppText({
      phone: signer.phoneWhatsE164,
      message: `Olá ${signer.name}, você foi convidado para assinar um documento no Doculink. Acesse o link: ${inviteLink}`
    });
  }
};

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