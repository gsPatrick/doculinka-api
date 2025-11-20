// src/models/tenantMember.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TenantMember extends Model {
    static associate(models) {
      TenantMember.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
      TenantMember.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    }
  }
  TenantMember.init({
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
    userId: {
      type: DataTypes.UUID,
      allowNull: true, // Pode ser null se o usuário ainda não se cadastrou (convite pendente pelo email)
      references: { model: 'Users', key: 'id' }
    },
    email: { // Email convidado (importante caso o usuário ainda não exista)
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('ADMIN', 'USER'),
      defaultValue: 'USER',
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'ACTIVE', 'DECLINED'),
      defaultValue: 'PENDING',
      allowNull: false
    },
    invitedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    sequelize,
    modelName: 'TenantMember',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['tenantId', 'email'] } // Um email só pode ser convidado uma vez por tenant
    ]
  });
  return TenantMember;
};