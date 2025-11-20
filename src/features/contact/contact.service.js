// src/features/contact/contact.service.js
'use strict';

const { Contact } = require('../../models');
const { Op } = require('sequelize');

/**
 * Cria um novo contato na lista pessoal do usuário ou atualiza se já existir.
 * @param {User} user - O usuário autenticado (owner).
 * @param {object} contactData - Dados do contato { name, email, cpf, phone }.
 */
const createContact = async (user, contactData) => {
  const { name, email, cpf, phone } = contactData;

  // Busca ou Cria baseado no email + dono (Agenda Pessoal)
  const [contact, created] = await Contact.findOrCreate({
    where: { 
      ownerId: user.id, 
      email: email.toLowerCase() 
    },
    defaults: { 
      name, 
      cpf, 
      phone,
      status: 'ACTIVE' // Garante que nasce ativo
    }
  });

  // Se o contato já existia (created = false), atualizamos os dados
  // Isso é útil se o usuário mudou o telefone ou corrigiu o nome
  if (!created) {
    contact.name = name;
    if (cpf) contact.cpf = cpf;
    if (phone) contact.phone = phone;
    // Opcional: Se estava INACTIVE, podemos reativar automaticamente
    // contact.status = 'ACTIVE'; 
    await contact.save();
  }

  return contact;
};

/**
 * Lista todos os contatos pertencentes ao usuário logado.
 * @param {User} user - O usuário autenticado.
 */
const listContacts = async (user) => {
  return Contact.findAll({
    where: { ownerId: user.id },
    order: [['name', 'ASC']]
  });
};

/**
 * Atualiza dados de um contato específico.
 */
const updateContact = async (user, contactId, updateData) => {
  const contact = await Contact.findOne({ 
    where: { id: contactId, ownerId: user.id } 
  });

  if (!contact) {
    throw new Error('Contato não encontrado ou acesso negado.');
  }

  // Filtra apenas os campos permitidos para atualização
  const allowedUpdates = ['name', 'email', 'cpf', 'phone', 'isFavorite', 'status'];
  const validUpdates = {};

  for (const key of allowedUpdates) {
    if (updateData[key] !== undefined) {
      validUpdates[key] = updateData[key];
    }
  }

  await contact.update(validUpdates);
  return contact;
};

/**
 * Deleta um contato permanentemente.
 */
const deleteContact = async (user, contactId) => {
  const contact = await Contact.findOne({ 
    where: { id: contactId, ownerId: user.id } 
  });

  if (!contact) {
    throw new Error('Contato não encontrado ou acesso negado.');
  }

  await contact.destroy();
};

/**
 * Inativa múltiplos contatos de uma vez (Soft Delete lógico).
 * @param {User} user - O usuário autenticado.
 * @param {Array<string>} contactIds - Lista de IDs para inativar.
 */
const inactivateContactsBulk = async (user, contactIds) => {
  const [affectedCount] = await Contact.update(
    { status: 'INACTIVE' }, 
    {
      where: {
        ownerId: user.id,   // Segurança: só altera contatos do dono
        id: {
          [Op.in]: contactIds // Onde o ID está na lista fornecida
        }
      }
    }
  );

  return { affectedCount };
};

module.exports = {
  createContact,
  listContacts,
  updateContact,
  deleteContact,
  inactivateContactsBulk  
};