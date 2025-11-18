// src/features/user/user.service.js
'use strict';

const { User } = require('../../models');
const bcrypt = require('bcrypt');
const auditService = require('../audit/audit.service');

/**
 * Atualiza os dados de perfil do próprio usuário logado (apenas campos permitidos).
 * @param {string} userId - O ID do usuário a ser atualizado.
 * @param {object} updateData - Os dados a serem atualizados (ex: { name, phoneWhatsE164 }).
 * @returns {Promise<User>} - A instância do usuário atualizado.
 */
const updateUser = async (userId, updateData) => {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new Error('Usuário não encontrado.');
  }

  // Define uma lista de campos que o usuário tem permissão para atualizar nesta rota.
  const allowedUpdates = ['name', 'phoneWhatsE164'];
  const validUpdates = {};

  for (const key of allowedUpdates) {
    if (updateData[key] !== undefined) {
      validUpdates[key] = updateData[key];
    }
  }

  await user.update(validUpdates);
  return user;
};

/**
 * Altera a senha do próprio usuário após validar sua senha atual.
 * @param {User} user - O objeto do usuário autenticado (do authGuard).
 * @param {string} currentPassword - A senha atual enviada pelo usuário para verificação.
 * @param {string} newPassword - A nova senha a ser definida.
 */
const changeUserPassword = async (user, currentPassword, newPassword) => {
  // Usa o escopo 'withPassword' para buscar o hash da senha, que é oculto por padrão
  const userWithPassword = await User.scope('withPassword').findByPk(user.id);
  
  if (!userWithPassword || !userWithPassword.passwordHash) {
    throw new Error('Conta configurada incorretamente ou usuário não encontrado.');
  }

  // Compara a senha atual enviada com o hash salvo no banco.
  const isMatch = await bcrypt.compare(currentPassword, userWithPassword.passwordHash);
  if (!isMatch) {
    const error = new Error('A senha atual está incorreta.');
    error.statusCode = 403;
    throw error;
  }
  
  // Valida a nova senha.
  if (!newPassword || newPassword.length < 6) {
    const error = new Error('A nova senha deve ter no mínimo 6 caracteres.');
    error.statusCode = 400;
    throw error;
  }
  
  // Criptografa e salva a nova senha no banco.
  userWithPassword.passwordHash = await bcrypt.hash(newPassword, 10);
  await userWithPassword.save();

  // Log de Auditoria (Opcional para troca de senha própria)
  await auditService.createEntry({
    tenantId: user.tenantId,
    actorKind: 'USER',
    actorId: user.id,
    entityType: 'USER',
    entityId: user.id,
    action: 'PASSWORD_CHANGED',
    ip: 'SYSTEM', // Idealmente repassado do controller
    userAgent: 'SYSTEM'
  });
};

// --- FUNÇÕES ADMINISTRATIVAS (Acesso via AdminGuard) ---

/**
 * Lista todos os usuários do Tenant (Apenas para Admin).
 */
const listUsersByTenant = async (tenantId) => {
  return User.findAll({
    where: { tenantId },
    attributes: ['id', 'name', 'email', 'role', 'status', 'createdAt', 'phoneWhatsE164'], // Exclui passwordHash
    order: [['name', 'ASC']]
  });
};

/**
 * Cria um novo usuário dentro do Tenant (Convidado pelo Admin).
 */
const createUserByAdmin = async (adminUser, userData) => {
  const { name, email, password, role, cpf, phone } = userData;

  if (!email || !password || !name) {
    throw new Error('Nome, e-mail e senha são obrigatórios.');
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) throw new Error('E-mail já está em uso.');

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = await User.create({
    tenantId: adminUser.tenantId, // Força o mesmo tenant do admin
    name,
    email,
    passwordHash,
    role: role || 'USER',
    cpf,
    phoneWhatsE164: phone,
    status: 'ACTIVE'
  });

  // Log de Auditoria
  await auditService.createEntry({
    tenantId: adminUser.tenantId,
    actorKind: 'USER',
    actorId: adminUser.id,
    entityType: 'USER',
    entityId: newUser.id,
    action: 'USER_CREATED',
    ip: 'SYSTEM',
    userAgent: 'SYSTEM',
    payload: { email: newUser.email, role: newUser.role }
  });

  const userJson = newUser.toJSON();
  delete userJson.passwordHash;
  return userJson;
};

/**
 * Atualiza ou Bloqueia um usuário (Ação de Admin).
 * Permite alterar role, status, nome e até resetar a senha.
 */
const updateUserByAdmin = async (adminUser, targetUserId, updates) => {
  const user = await User.findOne({ where: { id: targetUserId, tenantId: adminUser.tenantId } });
  
  if (!user) throw new Error('Usuário não encontrado.');

  // Apenas campos permitidos
  if (updates.name) user.name = updates.name;
  if (updates.role) user.role = updates.role;
  if (updates.status) user.status = updates.status;
  if (updates.phone) user.phoneWhatsE164 = updates.phone;
  
  // Se o admin enviou uma nova senha, reseta a senha do usuário
  if (updates.password && updates.password.length >= 6) {
      user.passwordHash = await bcrypt.hash(updates.password, 10);
  }

  await user.save();

  await auditService.createEntry({
    tenantId: adminUser.tenantId,
    actorKind: 'USER',
    actorId: adminUser.id,
    entityType: 'USER',
    entityId: user.id,
    action: 'USER_UPDATED',
    ip: 'SYSTEM',
    userAgent: 'SYSTEM',
    payload: { updates: Object.keys(updates) }
  });

  // Retorna o usuário sem o hash da senha
  const userJson = user.toJSON();
  delete userJson.passwordHash;
  return userJson;
};

/**
 * Remove um usuário permanentemente.
 */
const deleteUserByAdmin = async (adminUser, targetUserId) => {
  if (adminUser.id === targetUserId) {
    throw new Error('Você não pode excluir a si mesmo.');
  }

  const user = await User.findOne({ where: { id: targetUserId, tenantId: adminUser.tenantId } });
  if (!user) throw new Error('Usuário não encontrado.');

  // Salva dados para o log antes de deletar
  const userEmail = user.email;
  const userId = user.id;

  await user.destroy();

  await auditService.createEntry({
    tenantId: adminUser.tenantId,
    actorKind: 'USER',
    actorId: adminUser.id,
    entityType: 'USER',
    entityId: userId, // ID que foi removido
    action: 'USER_DELETED', // Ação no formatter pode ser mapeada para "Usuário removido"
    ip: 'SYSTEM',
    userAgent: 'SYSTEM',
    payload: { email: userEmail }
  });
};

module.exports = {
  updateUser,
  changeUserPassword,
  listUsersByTenant,
  createUserByAdmin,
  updateUserByAdmin,
  deleteUserByAdmin
};