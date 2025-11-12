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

module.exports = { listUniqueSignatories };