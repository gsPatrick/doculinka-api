// src/models/user.js
'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
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
    // --- NOVO CAMPO ---
    role: {
      type: DataTypes.ENUM('ADMIN', 'USER'),
      defaultValue: 'USER',
      allowNull: false
    },
    // ------------------
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
      type: DataTypes.STRING, // ACTIVE, BLOCKED
      defaultValue: 'ACTIVE',
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'User',
    timestamps: true,
    updatedAt: false,
    defaultScope: {
      attributes: { exclude: ['passwordHash'] }
    },
    scopes: {
      withPassword: {
        attributes: { include: ['passwordHash'] }
      }
    }
  });
  return User;
};