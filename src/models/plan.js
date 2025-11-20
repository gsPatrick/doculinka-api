// src/models/plan.js
'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Plan extends Model {
    static associate(models) {
      Plan.hasMany(models.Tenant, { foreignKey: 'planId' });
    }
  }
  Plan.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    slug: { // basico, profissional, empresa
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    userLimit: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    documentLimit: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    features: {
      type: DataTypes.JSONB, // Lista de features para exibir no front
      defaultValue: []
    }
  }, {
    sequelize,
    modelName: 'Plan',
    timestamps: true,
    updatedAt: false
  });
  return Plan;
};