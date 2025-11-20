// src/models/tenant.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Tenant extends Model {
    static associate(models) {
      Tenant.hasMany(models.User, { foreignKey: 'tenantId', as: 'ownerUsers' });
      Tenant.hasMany(models.Document, { foreignKey: 'tenantId' });
      Tenant.belongsTo(models.Plan, { foreignKey: 'planId', as: 'plan' });
      Tenant.hasMany(models.TenantMember, { foreignKey: 'tenantId', as: 'members' });
    }
  }
  Tenant.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    planId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'Plans', key: 'id' }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'ACTIVE',
      allowNull: false
    },
    // --- CAMPOS NOVOS PARA ASAAS ---
    asaasCustomerId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    asaasSubscriptionId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    subscriptionStatus: {
        type: DataTypes.STRING, // ACTIVE, OVERDUE, CANCELED
        defaultValue: 'ACTIVE'
    }
  }, {
    sequelize,
    modelName: 'Tenant',
    timestamps: true,
    updatedAt: false
  });
  return Tenant;
};
