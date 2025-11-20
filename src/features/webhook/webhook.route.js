// src/features/webhook/webhook.route.js
'use strict';
const { Router } = require('express');
const controller = require('./webhook.controller');

const router = Router();

// Rota pública (Asaas chama esta rota)
router.post('/asaas', controller.handleAsaasWebhook);

module.exports = router;
