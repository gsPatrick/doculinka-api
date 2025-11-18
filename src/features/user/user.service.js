// src/features/user/user.service.js
'use strict';

const { User } = require('../../models');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize'); // Importar o Op para queries

/**
 * Atualiza os dados de perfil de um usuário (apenas campos permitidos).
 * @param {string} userId - O ID do usuário a ser atualizado.
 * @param {object} updateData - Os dados a serem atualizados (ex: { name, phoneWhatsE164 }).
 * @returns {Promise<User>} - A instância do usuário atualizado.
 */
const updateUser = async (userId, updateData) => {
  const user = await User.findByPk(userId);
  if (!user) {
    const error = new Error('Usuário não encontrado.');
    error.statusCode = 404;
    throw error;
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
 * Altera a senha de um usuário após validar sua senha atual.
 * @param {User} user - O objeto do usuário autenticado (do authGuard).
 * @param {string} currentPassword - A senha atual para verificação.
 * @param {string} newPassword - A nova senha a ser definida.
 */
const changeUserPassword = async (user, currentPassword, newPassword) => {
  const userWithPassword = await User.scope('withPassword').findByPk(user.id);
  if (!userWithPassword) {
    throw new Error('Usuário não encontrado.');
  }
  
  if (!userWithPassword.passwordHash) {
    throw new Error('Conta configurada incorretamente, sem hash de senha.');
  }

  const isMatch = await bcrypt.compare(currentPassword, userWithPassword.passwordHash);
  if (!isMatch) {
    const error = new Error('A senha atual está incorreta.');
    error.statusCode = 403;
    throw error;
  }
  
  if (!newPassword || newPassword.length < 6) {
    const error = new Error('A nova senha deve ter no mínimo 6 caracteres.');
    error.statusCode = 400;
    throw error;
  }
  
  userWithPassword.passwordHash = await bcrypt.hash(newPassword, 10);
  await userWithPassword.save();
};


// --- FUNÇÕES DE ADMINISTRAÇÃO (ADICIONADAS AQUI) ---

/**
 * Lista todos os usuários de um determinado Tenant.
 * @param {string} tenantId - O ID do tenant.
 * @returns {Promise<User[]>}
 */
const listUsersByTenant = async (tenantId) => {
  return User.findAll({ where: { tenantId } });
};

/**
 * Cria um novo usuário (por um administrador).
 * @param {User} adminUser - O usuário admin que está executando a ação.
 * @param {object} newUserDto - Dados do novo usuário { name, email, password, role }.
 * @returns {Promise<User>}
 */
const createUserByAdmin = async (adminUser, newUserDto) => {
  const { name, email, password, role } = newUserDto;

  if (!name || !email || !password) {
    const error = new Error('Nome, e-mail e senha são obrigatórios.');
    error.statusCode = 400;
    throw error;
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    const error = new Error('O e-mail fornecido já está em uso.');
    error.statusCode = 409; // Conflict
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = await User.create({
    name,
    email,
    passwordHash,
    role: role || 'USER', // Padrão é 'USER' se não for especificado
    tenantId: adminUser.tenantId, // Novo usuário pertence ao mesmo tenant do admin
    status: 'ACTIVE'
  });

  return newUser;
};

/**
 * Atualiza os dados de um usuário (por um administrador).
 * @param {User} adminUser - O usuário admin que está executando a ação.
 * @param {string} targetUserId - ID do usuário a ser atualizado.
 * @param {object} updateData - Dados a serem atualizados { name, role, status }.
 * @returns {Promise<User>}
 */
const updateUserByAdmin = async (adminUser, targetUserId, updateData) => {
  const userToUpdate = await User.findOne({
    where: { id: targetUserId, tenantId: adminUser.tenantId }
  });

  if (!userToUpdate) {
    const error = new Error('Usuário não encontrado ou não pertence a esta organização.');
    error.statusCode = 404;
    throw error;
  }

  const allowedUpdates = ['name', 'role', 'status'];
  const validUpdates = {};
  for (const key of allowedUpdates) {
    if (updateData[key] !== undefined) {
      validUpdates[key] = updateData[key];
    }
  }

  await userToUpdate.update(validUpdates);
  return userToUpdate;
};

/**
 * Deleta um usuário (por um administrador).
 * @param {User} adminUser - O usuário admin que está executando a ação.
 * @param {string} targetUserId - ID do usuário a ser deletado.
 */
const deleteUserByAdmin = async (adminUser, targetUserId) => {
  if (adminUser.id === targetUserId) {
    const error = new Error('Um administrador não pode deletar a própria conta.');
    error.statusCode = 403;
    throw error;
  }

  const userToDelete = await User.findOne({
    where: { id: targetUserId, tenantId: adminUser.tenantId }
  });

  if (!userToDelete) {
    const error = new Error('Usuário não encontrado ou não pertence a esta organização.');
    error.statusCode = 404;
    throw error;
  }

  await userToDelete.destroy();
};


// --- EXPORTAÇÃO DE TODAS AS FUNÇÕES ---
module.exports = {
  updateUser,
  changeUserPassword,
  // Adiciona as novas funções à exportação
  listUsersByTenant,
  createUserByAdmin,
  updateUserByAdmin,
  deleteUserByAdmin
};