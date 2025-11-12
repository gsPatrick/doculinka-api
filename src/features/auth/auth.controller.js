// src/features/auth/auth.controller.js

const authService = require('./auth.service');

/**
 * Controller para o registro de um novo usuário.
 * Recebe nome, e-mail e senha, e repassa para o serviço de autenticação.
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Validação de entrada básica
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    const { accessToken, refreshToken, user } = await authService.registerUser({ name, email, password });

    // Retorna os tokens e os dados do usuário recém-criado
    return res.status(201).json({ accessToken, refreshToken, user });

  } catch (error) {
    // Passa o erro para o middleware de tratamento de erros global.
    // Isso capturará erros como "e-mail já em uso".
    next(error);
  }
};

/**
 * Controller para o login do usuário.
 * Recebe e-mail e senha e repassa para o serviço de autenticação.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validação de entrada
    if (!email || !password) {
      return res.status(400).json({ message: 'E-mail and password are required.' });
    }

    const { accessToken, refreshToken, user } = await authService.loginUser(email, password);

    // Retorna os tokens e os dados do usuário logado
    return res.status(200).json({ accessToken, refreshToken, user });

  } catch (error) {
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
    // Erros de token inválido ou expirado serão tratados aqui
    next(error);
  }
};

/**
 * Controller para realizar o logout, invalidando o refresh token.
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token é obrigatório.' });
    }
    
    // O req.user é fornecido pelo authGuard, garantindo que o usuário está logado
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