// src/features/user/user.service.js
'use strict';

const { User } = require('../../models');
const bcrypt = require('bcrypt'); // Importa o bcrypt para comparação e hashing de senhas

/**
 * Atualiza os dados de perfil de um usuário (apenas campos permitidos).
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
 * Altera a senha de um usuário após validar sua senha atual.
 * @param {User} user - O objeto do usuário autenticado (do authGuard, sem o passwordHash).
 * @param {string} currentPassword - A senha atual enviada pelo usuário para verificação.
 * @param {string} newPassword - A nova senha a ser definida.
 */
const changeUserPassword = async (user, currentPassword, newPassword) => {
  // --- CORREÇÃO APLICADA ---
  // Usa o escopo 'withPassword' para buscar a instância completa do usuário, incluindo o passwordHash.
  const userWithPassword = await User.scope('withPassword').findByPk(user.id);
  // -------------------------
  
  if (!userWithPassword) {
    // Verificação de segurança, embora improvável de acontecer com um usuário logado.
    throw new Error('Usuário não encontrado.');
  }
  
  // Agora a verificação 'userWithPassword.passwordHash' não deve mais falhar.
  if (!userWithPassword.passwordHash) {
    // Este erro indica um problema sério na criação da conta.
    throw new Error('Conta configurada incorretamente, sem hash de senha.');
  }

  // Compara a senha atual enviada com o hash salvo no banco.
  const isMatch = await bcrypt.compare(currentPassword, userWithPassword.passwordHash);
  if (!isMatch) {
    const error = new Error('A senha atual está incorreta.');
    error.statusCode = 403; // Forbidden (Acesso negado)
    throw error;
  }
  
  // Valida a nova senha.
  if (!newPassword || newPassword.length < 6) {
    const error = new Error('A nova senha deve ter no mínimo 6 caracteres.');
    error.statusCode = 400; // Bad Request (Requisição inválida)
    throw error;
  }
  
  // Criptografa e salva a nova senha no banco.
  userWithPassword.passwordHash = await bcrypt.hash(newPassword, 10);
  await userWithPassword.save();

  // Não retorna nada em caso de sucesso, o controller enviará uma mensagem de sucesso.
};

module.exports = {
  updateUser,
  changeUserPassword,
};