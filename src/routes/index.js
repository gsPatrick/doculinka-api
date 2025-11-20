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

// --- NOVAS IMPORTAÇÕES ---
const subscriptionRoutes = require('../features/subscription/subscription.route');
const webhookRoutes = require('../features/webhook/webhook.route');

// 2. Inicialização do roteador principal
const router = Router();

// 3. Definição das rotas
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/tenants', tenantRoutes);
router.use('/documents', documentRoutes);
router.use('/sign', signerRoutes);
router.use('/contacts', contactRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit', auditRoutes);

// --- NOVAS ROTAS ---
router.use('/subscription', subscriptionRoutes);
router.use('/webhooks', webhookRoutes);

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;