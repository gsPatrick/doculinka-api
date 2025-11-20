'use strict';

const { Router } = require('express');
const controller = require('./subscription.controller');
const authGuard = require('../../middlewares/authGuard');
const roleGuard = require('../../middlewares/roleGuard');

const router = Router();

router.use(authGuard);

// Apenas ADMIN da organização pode gerenciar pagamentos
router.post('/', roleGuard(['ADMIN', 'SUPER_ADMIN']), controller.createSubscription);
router.delete('/', roleGuard(['ADMIN', 'SUPER_ADMIN']), controller.cancel);

module.exports = router;