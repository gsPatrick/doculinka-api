// src/middlewares/adminGuard.js

const adminGuard = (req, res, next) => {
  // O authGuard já rodou antes e preencheu req.user
  if (!req.user) {
    return res.status(401).json({ message: 'Usuário não autenticado.' });
  }

  if (req.user.role !== 'ADMIN') {
    // Log de segurança opcional aqui
    return res.status(403).json({ message: 'Acesso negado. Requer privilégios de administrador.' });
  }

  next();
};

module.exports = adminGuard;