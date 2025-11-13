'use strict';
const { Contact } = require('../../models');

/**
 * Cria um novo contato na lista do usuário, evitando duplicatas.
 * @param {User} user - O usuário autenticado.
 * @param {object} contactData - Dados do novo contato.
 */
const createContact = async (user, contactData) => {
  const { name, email, cpf, phone } = contactData;

  // findOrCreate garante que não haverá duplicatas de e-mail para o mesmo usuário
  const [contact, created] = await Contact.findOrCreate({
    where: { ownerId: user.id, email: email.toLowerCase() },
    defaults: { name, cpf, phone }
  });

  if (!created) {
    // Se o contato já existia, atualiza seus dados
    contact.name = name;
    contact.cpf = cpf;
    contact.phone = phone;
    await contact.save();
  }

  return contact;
};

/**
 * Lista todos os contatos pertencentes ao usuário logado.
 * @param {User} user - O usuário autenticado.
 */
const listContacts = async (user) => {
  const contacts = await Contact.findAll({
    where: { ownerId: user.id },
    order: [['name', 'ASC']]
  });
  return contacts;
};

module.exports = {
  createContact,
  listContacts,
};