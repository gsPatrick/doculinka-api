// src/routes/index.js
'use strict';

const { Router } = require('express');

// 1. Importação dos roteadores das funcionalidades
const authRoutes = require('../features/auth/auth.route');
const userRoutes = require('../features/user/user.route');
const tenantRoutes = require('../features/tenant/tenant.route');
const documentRoutes = require('../features/document/document.route');
// Importamos a nova rota de pastas
const folderRoutes = require('../features/document/folder.route'); 
const signerRoutes = require('../features/signer/signer.route');
const contactRoutes = require('../features/contact/contact.route');
const settingsRoutes = require('../features/settings/settings.route');
const auditRoutes = require('../features/audit/audit.route');
const subscriptionRoutes = require('../features/subscription/subscription.route');
const webhookRoutes = require('../features/webhook/webhook.route');

// 2. Inicialização do roteador principal
const router = Router();

// 3. Definição das rotas (Mounting)
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tenants', tenantRoutes);
router.use('/documents', documentRoutes);
router.use('/folders', folderRoutes); // <--- Nova rota montada aqui
router.use('/sign', signerRoutes);
router.use('/contacts', contactRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit', auditRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/webhooks', webhookRoutes);

// Rota de Health Check para monitoramento
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;