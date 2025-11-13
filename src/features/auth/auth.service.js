// src/features/auth/auth.service.js
'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, Tenant, Session, sequelize } = require('../../models');

// --- FUNÇÕES AUXILIARES INTERNAS ---

/**
 * Gera um 'slug' seguro para URL a partir de um nome.
 * @param {string} name - O nome a ser convertido.
 * @returns {string}
 */
const generateSlug = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Gera um par de tokens (access e refresh) para um usuário autenticado.
 * @param {User} user - O objeto do usuário do Sequelize.
 * @returns {{accessToken: string, refreshToken: string}}
 */
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { userId: user.id, tenantId: user.tenantId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

/**
 * Salva a sessão do refresh token no banco de dados.
 * @param {string} userId - ID do usuário.
 * @param {string} refreshToken - O token de refresh.
 */
const saveSession = async (userId, refreshToken) => {
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

  await Session.create({
    userId,
    refreshTokenHash,
    expiresAt,
  });
};


// --- FUNÇÕES DE SERVIÇO PRINCIPAIS (EXPORTADAS) ---

/**
 * Cadastra um novo usuário, com validações e logs de depuração para a senha.
 */
const registerUser = async (userData) => {
  const { name, email, password, cpf, phone } = userData;

  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new Error('A senha é inválida ou muito curta (mínimo 6 caracteres).');
  }

  const existingUser = await User.scope('withPassword').findOne({ where: { email } });
  if (existingUser) {
    throw new Error('Este e-mail já está em uso.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  console.log(`[AUTH-REGISTER-DEBUG] Hash da senha gerado para o e-mail ${email}.`);
  
  if (!passwordHash) {
      throw new Error("Falha crítica ao gerar o hash da senha.");
  }

  const transaction = await sequelize.transaction();
  try {
    let slug = generateSlug(`${name}'s Organization`);
    const newTenant = await Tenant.create({ name: `${name}'s Organization`, slug }, { transaction });

    const newUserPayload = {
      name,
      email,
      passwordHash,
      cpf,
      phoneWhatsE164: phone,
      tenantId: newTenant.id,
    };
    
    console.log('[AUTH-REGISTER-DEBUG] Payload enviado para User.create:', newUserPayload);
    const newUser = await User.create(newUserPayload, { transaction });
    
    const createdUserWithPassword = await User.scope('withPassword').findByPk(newUser.id, { transaction });

    if (!createdUserWithPassword || !createdUserWithPassword.passwordHash) {
      console.error(`[ERRO CRÍTICO] Usuário ${email} foi criado, mas o passwordHash está NULO no banco!`);
      throw new Error("Falha ao salvar a senha do usuário durante o registro.");
    }
    console.log(`[AUTH-REGISTER-DEBUG] Sucesso! Hash para ${email} foi confirmado no banco.`);

    await transaction.commit();

    const { accessToken, refreshToken } = generateTokens(createdUserWithPassword);
    await saveSession(createdUserWithPassword.id, refreshToken);
    
    const userToReturn = createdUserWithPassword.toJSON();
    delete userToReturn.passwordHash;

    return { accessToken, refreshToken, user: userToReturn };
  } catch (error) {
    await transaction.rollback();
    console.error("ERRO DETALHADO NA TRANSAÇÃO DE REGISTRO:", error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new Error('Não foi possível criar a conta. O CPF ou e-mail já está em uso.');
    }
    throw error;
  }
};

/**
 * Autentica um usuário com e-mail e senha.
 */
const loginUser = async (email, password) => {
  if (!password || typeof password !== 'string') {
    throw new Error('Credenciais inválidas.');
  }

  const user = await User.scope('withPassword').findOne({ where: { email } });
  
  if (!user || !user.passwordHash) {
    console.log(`[AUTH-LOGIN-DEBUG] Tentativa de login para ${email}: Usuário não encontrado ou sem hash de senha.`);
    throw new Error('Credenciais inválidas.');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  
  if (!isPasswordValid) {
    console.log(`[AUTH-LOGIN-DEBUG] Tentativa de login para ${email}: Senha incorreta.`);
    throw new Error('Credenciais inválidas.');
  }
  
  console.log(`[AUTH-LOGIN-DEBUG] Login bem-sucedido para ${email}.`);
  const { accessToken, refreshToken } = generateTokens(user);
  await saveSession(user.id, refreshToken);

  const userToReturn = user.toJSON();
  delete userToReturn.passwordHash;
  
  return { accessToken, refreshToken, user: userToReturn };
};

/**
 * Processa um refresh token para emitir um novo par de tokens.
 */
const handleRefreshToken = async (refreshTokenFromRequest) => {
  try {
    const decoded = jwt.verify(refreshTokenFromRequest, process.env.JWT_REFRESH_SECRET);
    const sessions = await Session.findAll({ where: { userId: decoded.userId } });
    if (!sessions || sessions.length === 0) throw new Error('Nenhuma sessão ativa encontrada.');
    
    let sessionRecord = null;
    for (const session of sessions) {
        const isMatch = await bcrypt.compare(refreshTokenFromRequest, session.refreshTokenHash);
        if (isMatch) {
            sessionRecord = session;
            break;
        }
    }
    if (!sessionRecord) throw new Error('Refresh token inválido ou revogado.');
    
    await sessionRecord.destroy();
    const user = await User.findByPk(decoded.userId);
    if (!user) throw new Error('Usuário associado ao token não encontrado.');

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    await saveSession(user.id, newRefreshToken);
    return { accessToken, refreshToken: newRefreshToken };
  } catch (error) {
    throw new Error('Acesso negado. Sessão inválida.');
  }
};

/**
 * Realiza o logout invalidando o refresh token específico no banco de dados.
 */
const handleLogout = async (refreshTokenFromRequest, user) => {
  const sessions = await Session.findAll({ where: { userId: user.id } });
  for (const session of sessions) {
      const isMatch = await bcrypt.compare(refreshTokenFromRequest, session.refreshTokenHash);
      if (isMatch) {
          await session.destroy();
          return;
      }
  }
};

module.exports = {
  registerUser,
  loginUser,
  handleRefreshToken,
  handleLogout,
};