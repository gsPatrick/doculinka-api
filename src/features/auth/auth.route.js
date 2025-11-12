// src/features/auth/auth.route.js

const { Router } = require('express');
const authController = require('./auth.controller');
const authGuard = require('../../middlewares/authGuard');

const router = Router();

// Rota para cadastrar um novo usuário (e seu tenant)
router.post('/register', authController.register);

// Rota para fazer login com e-mail e senha
router.post('/login', authController.login);

// Rota para obter um novo access token usando um refresh token
router.post('/refresh', authController.refreshToken);

// Rota para invalidar um refresh token (fazer logout)
router.post('/logout', authGuard, authController.logout);

module.exports = router;