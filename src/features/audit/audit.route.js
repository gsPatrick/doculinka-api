// src/features/audit/audit.route.js
'use strict';

const { Router } = require('express');
const auditController = require('./audit.controller');
const authGuard = require('../../middlewares/authGuard');

const router = Router();

// Protege a rota: Apenas usuários logados podem ver a auditoria
router.use(authGuard);

// GET /api/audit -> Lista logs formatados
router.get('/', auditController.getLogs);

module.exports = router;