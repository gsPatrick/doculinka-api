// src/config/plans.js
'use strict';

const PLANS = {
  FREE: {
    key: 'FREE',
    label: 'Gratuito',
    maxUsers: 1,
    maxDocuments: 3,
    price: 0
  },
  BASIC: {
    key: 'BASIC',
    label: 'Básico',
    maxUsers: 3,
    maxDocuments: 20,
    price: 29.90
  },
  PROFESSIONAL: {
    key: 'PROFESSIONAL',
    label: 'Profissional',
    maxUsers: 5,
    maxDocuments: 50,
    price: 49.90
  },
  ENTERPRISE: {
    key: 'ENTERPRISE',
    label: 'Empresa',
    maxUsers: 10,
    maxDocuments: 100,
    price: 79.90
  }
};

module.exports = PLANS;