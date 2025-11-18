const { Router } = require('express');
const controller = require('./settings.controller');
const authGuard = require('../../middlewares/authGuard');

const router = Router();
router.use(authGuard); // Apenas logado

router.get('/', controller.get);
router.patch('/', controller.update); // Usamos PATCH para atualizar

module.exports = router;