const { Signer, Document, sequelize } = require('../../models');

/**
 * Lista todos os signatários únicos que um usuário já convidou no passado.
 * @param {User} user - O usuário autenticado.
 */
const listUniqueSignatories = async (user) => {
  // Encontra todos os signatários de todos os documentos que pertencem ao usuário
  const uniqueSigners = await Signer.findAll({
    attributes: [
      [sequelize.fn('DISTINCT', sequelize.col('email')), 'email'],
      'name',
      'phoneWhatsE164',
    ],
    include: [{
      model: Document,
      attributes: [],
      where: { ownerId: user.id }
    }],
    group: ['email', 'name', 'phoneWhatsE164']
  });
  return uniqueSigners;
};

/**
 * Cria um novo "contato" signatário associado ao usuário, evitando duplicatas de e-mail.
 * @param {User} user - O usuário autenticado.
 * @param {object} signatoryData - Dados do novo signatário { name, email, cpf, phone }.
 */
const createSignatoryContact = async (user, signatoryData) => {
  const { name, email, phone, cpf } = signatoryData;

  // Usamos findOrCreate para evitar duplicatas de e-mail.
  // A busca é feita apenas pelo e-mail, que é o identificador principal.
  const [signer, created] = await Signer.findOrCreate({
    where: { email: email.toLowerCase() },
    defaults: {
      name,
      phoneWhatsE164: phone,
      cpf,
      // IMPORTANTE: Criamos este "contato" sem associá-lo a um documento específico ainda.
      // O documentId pode ser nulo ou podemos adicionar um campo "ownerId" para ligá-lo ao usuário.
      // Por simplicidade, vamos deixar documentId nulo por enquanto.
    }
  });

  // Se o signatário não foi criado (já existia), podemos opcionalmente atualizar seus dados.
  if (!created) {
    signer.name = name;
    signer.phoneWhatsE164 = phone;
    signer.cpf = cpf;
    await signer.save();
  }

  return signer;
};

module.exports = { listUniqueSignatories,createSignatoryContact };