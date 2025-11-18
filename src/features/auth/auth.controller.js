// src/features/auth/auth.controller.js
'use strict';

const authService = require('./auth.service');

/**
 * Controller para o registro de um novo usuário.
 * Recebe nome, e-mail, senha, CPF e telefone.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, cpf, phone } = req.body;

    // Validação básica de entrada
    if (!name || !email || !password || !cpf || !phone) {
      return res.status(400).json({ 
        message: 'Todos os campos são obrigatórios: nome, e-mail, senha, CPF e celular.' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        message: 'A senha deve ter no mínimo 6 caracteres.' 
      });
    }
    
    // Passa os dados para o serviço criar o Tenant e o User
    const result = await authService.registerUser({ name, email, password, cpf, phone });

    return res.status(201).json(result);

  } catch (error) {
    // Tratamento específico para conflitos (Email/CPF duplicado)
    if (error.message.includes('já está em uso')) {
        return res.status(409).json({ message: error.message });
    }
    next(error);
  }
};

/**
 * Controller para o login do usuário.
 * Captura IP e User-Agent para o Log de Auditoria.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
    }

    // --- CAPTURA DE CONTEXTO PARA AUDITORIA ---
    // Tenta pegar o IP real se estiver atrás de proxy (x-forwarded-for) ou direto
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const userAgent = req.headers['user-agent'] || 'Unknown Device';

    // Passa o objeto de contexto { ip, userAgent } como terceiro argumento
    const { accessToken, refreshToken, user } = await authService.loginUser(
      email, 
      password, 
      { ip, userAgent }
    );

    return res.status(200).json({ accessToken, refreshToken, user });

  } catch (error) {
    // Erros de credenciais inválidas cairão aqui (401 ou 400 dependendo do throw no service)
    next(error);
  }
};

/**
 * Controller para renovar um access token usando um refresh token.
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token é obrigatório.' });
    }

    const tokens = await authService.handleRefreshToken(refreshToken);
    return res.status(200).json(tokens);
  } catch (error) {
    next(error);
  }
};

/**
 * Controller para realizar o logout.
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token é obrigatório.' });
    }
    
    // O req.user é fornecido pelo authGuard
    // Se desejar auditar o logout também, pode passar ip/userAgent aqui futuramente
    await authService.handleLogout(refreshToken, req.user);
    
    return res.status(200).json({ message: 'Logout realizado com sucesso.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
};