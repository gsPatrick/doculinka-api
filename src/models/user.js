// src/models/user.js
'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // Define as associações aqui
      User.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
      User.hasMany(models.Session, { foreignKey: 'userId' });
      User.hasMany(models.Document, { foreignKey: 'ownerId', as: 'ownedDocuments' });
    }
  }
  User.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'Tenants', key: 'id' }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { isEmail: true }
    },
    cpf: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    phoneWhatsE164: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'ACTIVE',
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'User',
    timestamps: true,
    updatedAt: false, // Não usamos o campo updatedAt neste modelo

    // --- ESCOPOS PARA CONTROLE DE ATRIBUTOS ---
    defaultScope: {
      // Por padrão, SEMPRE exclui o hash da senha de qualquer busca (find, findOne, findAll, etc.)
      // Isso é uma medida de segurança para evitar vazamento acidental do hash.
      attributes: { exclude: ['passwordHash'] }
    },
    scopes: {
      // Um escopo nomeado que pode ser chamado explicitamente para incluir o passwordHash.
      // Usaremos User.scope('withPassword')... quando precisarmos validar a senha.
      withPassword: {
        attributes: { include: ['passwordHash'] }
      }
    }
    // ----------------------------------------
  });
  return User;
};