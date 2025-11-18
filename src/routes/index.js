// src/routes/index.js
'use strict';

const { Router } = require('express');

// 1. Importação de todos os roteadores das funcionalidades
const authRoutes = require('../features/auth/auth.route');
const userRoutes = require('../features/user/user.route');
const tenantRoutes = require('../features/tenant/tenant.route');
const documentRoutes = require('../features/document/document.route');
const signerRoutes = require('../features/signer/signer.route');
const contactRoutes = require('../features/contact/contact.route');
const settingsRoutes = require('../features/settings/settings.route');
const auditRoutes = require('../features/audit/audit.route');

// 2. Inicialização do roteador principal
const router = Router();

// 3. Definição das rotas base para cada funcionalidade
// O prefixo '/api' é adicionado no arquivo app.js, então aqui definimos o que vem depois.
// Ex: A rota POST /register do auth.route.js se tornará POST /api/auth/register
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tenants', tenantRoutes);
router.use('/documents', documentRoutes);
router.use('/sign', signerRoutes);
router.use('/contacts', contactRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit', auditRoutes);

// 4. (Opcional, mas recomendado) Rota de Health Check
// Uma rota simples para verificar se a API está no ar.
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// 5. Exportação do roteador principal para ser usado no app.js
module.exports = router;