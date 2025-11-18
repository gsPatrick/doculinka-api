// src/features/audit/audit.service.js
'use strict';

const crypto = require('crypto');
const { AuditLog, User, Signer, sequelize } = require('../../models');
const { formatAuditLogDescription, getLogCategory } = require('../../utils/auditFormatter');

/**
 * Cria uma entrada de log de auditoria segura (Hash Chain).
 * Pode ser chamada por qualquer serviço do sistema (Auth, Document, Settings).
 * 
 * @param {object} logData - Dados do evento.
 * @param {string} logData.tenantId - ID da organização.
 * @param {string} logData.actorKind - 'USER', 'SIGNER' ou 'SYSTEM'.
 * @param {string} logData.actorId - ID do ator (se houver).
 * @param {string} logData.entityType - 'DOCUMENT', 'USER', 'SYSTEM', etc.
 * @param {string} logData.entityId - ID da entidade afetada.
 * @param {string} logData.action - Código da ação (ex: 'LOGIN_SUCCESS').
 * @param {string} logData.ip - Endereço IP.
 * @param {string} logData.userAgent - Navegador/Dispositivo.
 * @param {object} logData.payload - Dados extras (JSON).
 * @param {import('sequelize').Transaction} [transaction] - Transação opcional do Sequelize.
 */
const createEntry = async (logData, transaction = null) => {
  const { 
    tenantId, actorKind, actorId, entityType, entityId, 
    action, ip, userAgent, payload = {} 
  } = logData;
  
  // 1. Lógica Blockchain (Hash Chain): Busca o último log desta entidade para criar o elo
  const lastEvent = await AuditLog.findOne({
    where: { entityId },
    order: [['createdAt', 'DESC']],
    transaction
  });

  // Se não houver anterior, cria um hash "gênesis"
  const prevEventHash = lastEvent 
    ? lastEvent.eventHash 
    : crypto.createHash('sha256').update(`genesis_block_${entityId}`).digest('hex');

  // 2. Prepara os dados para o hash atual (garante integridade)
  const payloadToHash = {
    actorKind, actorId, entityType, entityId, action, ip, userAgent, ...payload
  };
  // Adiciona timestamp ISO para garantir unicidade temporal
  const timestamp = new Date().toISOString(); 
  const payloadString = JSON.stringify(payloadToHash) + timestamp;

  // 3. Gera o hash do evento atual
  const eventHash = crypto.createHash('sha256')
    .update(prevEventHash + payloadString)
    .digest('hex');

  // 4. Salva no banco de dados
  return AuditLog.create({
    tenantId,
    actorKind,
    actorId,
    entityType,
    entityId,
    action,
    ip,
    userAgent,
    payloadJson: payload,
    prevEventHash,
    eventHash
  }, { transaction });
};

/**
 * Lista os logs de auditoria formatados para exibição no frontend.
 * Inclui a "tradução" das ações e resolução dos nomes dos atores.
 * 
 * @param {string} tenantId - ID da organização.
 * @param {object} filters - Opções de filtro e paginação.
 */
const listLogs = async (tenantId, { limit = 20, page = 1, action, search }) => {
  const offset = (page - 1) * limit;
  const where = { tenantId };

  // Filtro por tipo de ação (opcional)
  if (action) {
    where.action = action;
  }

  // TODO: Implementar filtro de 'search' (IP ou ActorName) se necessário via Op.like

  // 1. Busca os logs crus no banco
  const { count, rows } = await AuditLog.findAndCountAll({
    where,
    limit,
    offset,
    order: [['createdAt', 'DESC']]
  });

  // 2. Processa e formata cada linha
  const formattedRows = await Promise.all(rows.map(async (log) => {
    const logJson = log.toJSON();
    
    // Adiciona descrição amigável (Ex: "Login realizado com sucesso")
    logJson.description = formatAuditLogDescription(logJson);
    
    // Adiciona categoria visual (security, document, etc)
    logJson.category = getLogCategory(logJson.action);
    
    // Resolve o nome de quem fez a ação (Actor)
    let actorName = 'Sistema / Desconhecido';
    
    if (logJson.actorKind === 'SYSTEM') {
      actorName = 'Sistema Automático';
    } else if (logJson.actorId) {
      // Se foi um Usuário
      if (logJson.actorKind === 'USER') {
        const user = await User.findByPk(logJson.actorId, { attributes: ['name', 'email'] });
        if (user) {
          actorName = `${user.name} (${user.email})`;
        } else {
          actorName = 'Usuário Removido';
        }
      } 
      // Se foi um Signatário (assinando documento)
      else if (logJson.actorKind === 'SIGNER') {
        const signer = await Signer.findByPk(logJson.actorId, { attributes: ['name', 'email'] });
        if (signer) {
          actorName = `${signer.name} (Signatário)`;
        } else {
          actorName = 'Signatário';
        }
      }
    }

    logJson.actorName = actorName;

    return logJson;
  }));

  return {
    totalItems: count,
    totalPages: Math.ceil(count / limit),
    currentPage: parseInt(page),
    data: formattedRows
  };
};

module.exports = {
  createEntry,
  listLogs
};