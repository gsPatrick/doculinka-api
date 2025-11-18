// src/utils/auditFormatter.js
'use strict';

/**
 * Traduz e humaniza os logs de auditoria para o administrador.
 * @param {object} log - O objeto de log cru do banco de dados.
 * @returns {string} - Uma frase descritiva em português.
 */
const formatAuditLogDescription = (log) => {
  const payload = log.payloadJson || {};
  const action = log.action;

  switch (action) {
    // --- AUTENTICAÇÃO & SESSÃO ---
    case 'LOGIN_SUCCESS':
      return 'Login realizado com sucesso no painel.';
    case 'LOGIN_FAILED':
      return 'Tentativa de login falhou (senha incorreta ou usuário inexistente).';
    case 'LOGOUT':
      return 'Usuário realizou logout do sistema.';
    case 'OTP_SENT':
      return `Código de verificação (OTP) enviado para ${payload.recipient || 'o usuário'}.`;
    case 'OTP_VERIFIED':
      return 'Identidade verificada com sucesso via código OTP.';
    case 'OTP_FAILED':
      return 'Falha na verificação de identidade (Código OTP inválido).';

    // --- GESTÃO DE USUÁRIOS ---
    case 'USER_CREATED':
      return `Novo usuário ${payload.email || ''} foi cadastrado no sistema.`;
    case 'USER_UPDATED':
      return 'Dados do perfil do usuário foram atualizados.';
    case 'PASSWORD_CHANGED':
      return 'A senha de acesso foi alterada.';

    // --- DOCUMENTOS ---
    case 'CREATED': // Contexto: Documento
      return `Documento "${payload.title || 'Sem título'}" foi criado.`;
    case 'STORAGE_UPLOADED':
      return `Arquivo original "${payload.fileName || 'PDF'}" foi enviado para o armazenamento seguro.`;
    case 'VIEWED':
      return 'O documento foi visualizado pelo signatário.';
    case 'STATUS_CHANGED':
      const statusMap = {
        'CANCELLED': 'cancelado',
        'EXPIRED': 'expirado',
        'SIGNED': 'finalizado',
        'READY': 'pronto para envio'
      };
      const newStatus = statusMap[payload.newStatus] || payload.newStatus;
      return `O status do documento mudou para "${newStatus}".`;
    
    // --- ASSINATURAS ---
    case 'INVITED':
      return `Convite para assinar enviado para ${payload.recipient || 'um signatário'}.`;
    case 'SIGNED':
      return 'Assinatura realizada e registrada com sucesso.';
    case 'PADES_SIGNED':
      return 'O documento recebeu a assinatura digital (PAdES) da plataforma, garantindo sua integridade.';
    case 'CERTIFICATE_ISSUED':
      return 'Certificado de conclusão de assinaturas gerado.';

    // --- OUTROS ---
    case 'DOWNLOADED':
      return 'O arquivo do documento foi baixado.';
    case 'API_KEY_GENERATED':
      return 'Uma nova chave de API foi gerada para integrações.';
    case 'ACCOUNT_LOCKED':
      return 'A conta foi bloqueada temporariamente por excesso de tentativas falhas.';

    default:
      // Fallback genérico, mas amigável
      return `Ação registrada: ${action}.`;
  }
};

/**
 * Identifica a categoria do evento para ícones ou filtros no frontend.
 */
const getLogCategory = (action) => {
  if (['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'OTP_SENT', 'OTP_VERIFIED'].includes(action)) return 'security';
  if (['CREATED', 'STATUS_CHANGED', 'STORAGE_UPLOADED', 'CERTIFICATE_ISSUED'].includes(action)) return 'document';
  if (['INVITED', 'SIGNED', 'VIEWED'].includes(action)) return 'signer';
  return 'system';
};

module.exports = { formatAuditLogDescription, getLogCategory };