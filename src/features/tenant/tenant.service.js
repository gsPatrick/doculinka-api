// src/features/tenant/tenant.service.js
'use strict';

const { Tenant, User, Plan, TenantMember, sequelize } = require('../../models');
const notificationService = require('../../services/notification.service');
const { Op } = require('sequelize');

/**
 * Gera um slug amigável para URL a partir do nome.
 */
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Cria um novo Tenant e o primeiro usuário Admin (Super Admin ou Admin de Tenant).
 */
const createTenantWithAdmin = async (tenantName, adminUserData) => {
  const transaction = await sequelize.transaction();
  try {
    let slug = generateSlug(tenantName);
    const existingTenant = await Tenant.findOne({ where: { slug }, transaction });
    
    if (existingTenant) {
      slug = `${slug}-${Math.random().toString(36).substring(2, 7)}`;
    }

    // Atribui o plano Básico por padrão ao criar uma nova empresa
    const basicPlan = await Plan.findOne({ where: { slug: 'basico' }, transaction });

    const tenant = await Tenant.create({
      name: tenantName,
      slug: slug,
      status: 'ACTIVE',
      planId: basicPlan ? basicPlan.id : null
    }, { transaction });

    await User.create({
      tenantId: tenant.id,
      name: adminUserData.name,
      email: adminUserData.email,
      // Quem cria o tenant é o ADMIN dele
      role: 'ADMIN', 
      status: 'ACTIVE'
    }, { transaction });

    await transaction.commit();
    return tenant;
  } catch (error) {
    await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new Error(`O e-mail '${adminUserData.email}' já está em uso.`);
    }
    throw error;
  }
};

/**
 * Lista todos os tenants (Apenas Super Admin).
 */
const findAllTenants = async () => {
  return Tenant.findAll({
    order: [['name', 'ASC']],
    include: [{ model: Plan, as: 'plan' }]
  });
};

/**
 * Busca um tenant por ID, incluindo dados do plano e estatísticas de uso.
 */
const findTenantById = async (id) => {
  const tenant = await Tenant.findByPk(id, {
    include: [{ model: Plan, as: 'plan' }]
  });
  
  if (!tenant) {
    throw new Error('Tenant não encontrado.');
  }
  
  // Contagem de Uso para Limites do Plano
  const owners = await User.count({ where: { tenantId: id, status: 'ACTIVE' } });
  const members = await TenantMember.count({ where: { tenantId: id, status: 'ACTIVE' } });
  const docs = await sequelize.models.Document.count({ where: { tenantId: id } });

  const tenantData = tenant.toJSON();
  tenantData.usage = {
    users: owners + members,
    documents: docs
  };
  
  return tenantData;
};

/**
 * Atualiza dados do Tenant (Nome, Plano, Status).
 */
const updateTenantById = async (id, updateData) => {
  const tenant = await Tenant.findByPk(id);
  if (!tenant) {
    throw new Error('Tenant não encontrado.');
  }

  const allowedUpdates = ['name', 'status', 'planId'];
  const validUpdates = {};

  for (const key of allowedUpdates) {
    if (updateData[key] !== undefined) {
      validUpdates[key] = updateData[key];
    }
  }

  if (validUpdates.name) {
    validUpdates.slug = generateSlug(validUpdates.name);
  }

  await tenant.update(validUpdates);
  return tenant;
};

// --- GESTÃO DE MEMBROS E CONVITES ---

/**
 * Lista todos os tenants aos quais o usuário tem acesso (Conta Pessoal + Convites Aceitos).
 * Usado para o "Switch Tenant".
 */
const listMyTenants = async (userId) => {
  // 1. Busca Tenant Pessoal (onde ele é o Dono/User principal)
  const user = await User.findByPk(userId, {
    include: [{ model: Tenant, as: 'ownTenant' }]
  });

  // 2. Busca Tenants onde ele é membro convidado e aceitou (ACTIVE)
  const memberships = await TenantMember.findAll({
    where: { userId, status: 'ACTIVE' },
    include: [{ model: Tenant, as: 'tenant' }]
  });

  // 3. Monta lista unificada
  const list = [];
  
  if (user.ownTenant) {
    list.push({
      id: user.ownTenant.id,
      name: user.ownTenant.name,
      role: 'ADMIN', // Dono é sempre Admin da sua conta pessoal
      isPersonal: true
    });
  }

  memberships.forEach(m => {
    if (m.tenant) {
      list.push({
        id: m.tenant.id,
        name: m.tenant.name,
        role: m.role, // O papel que foi atribuído no convite (VIEWER, MANAGER, ADMIN)
        isPersonal: false
      });
    }
  });

  return list;
};

/**
 * Convida um usuário por e-mail para o Tenant atual.
 */
const inviteMember = async (currentTenantId, email, role = 'VIEWER') => {
  // 1. Verifica Limite do Plano
  const tenant = await Tenant.findByPk(currentTenantId, { include: [{ model: Plan, as: 'plan' }] });
  
  if (tenant.plan) {
    // Conta donos + membros ativos + membros pendentes (reservam vaga)
    const ownerCount = await User.count({ where: { tenantId: currentTenantId, status: 'ACTIVE' } });
    const memberCount = await TenantMember.count({ 
      where: { 
        tenantId: currentTenantId, 
        status: { [Op.ne]: 'DECLINED' } // Conta PENDING e ACTIVE
      } 
    });
    
    if ((ownerCount + memberCount) >= tenant.plan.userLimit) {
      throw new Error(`Limite de usuários do plano atingido (${tenant.plan.userLimit}). Faça upgrade para adicionar mais.`);
    }
  }

  // 2. Verifica se o usuário já existe no sistema
  const existingUser = await User.findOne({ where: { email } });

  // 3. Cria ou Atualiza o convite (TenantMember)
  const [member, created] = await TenantMember.findOrCreate({
    where: { tenantId: currentTenantId, email },
    defaults: {
      userId: existingUser ? existingUser.id : null,
      role,
      status: 'PENDING'
    }
  });

  if (!created) {
    if (member.status === 'ACTIVE') {
      throw new Error('Este usuário já é membro desta organização.');
    }
    // Se estava rejeitado ou pendente, renova o convite
    member.status = 'PENDING';
    member.userId = existingUser ? existingUser.id : null;
    member.role = role;
    await member.save();
  }

  // 4. Envia E-mail (Lógica de Negócio)
  const inviteLink = existingUser 
    ? `${process.env.FRONT_URL}/onboarding` // Vai ver o modal de convite
    : `${process.env.FRONT_URL}/register?email=${email}`; // Vai criar conta

  // TODO: Chamar notificationService real aqui
  console.log(`[Invite] Enviando convite para ${email}. Link: ${inviteLink}`);
  
  return member;
};

/**
 * Lista convites pendentes RECEBIDOS pelo usuário (para aceitar/recusar).
 */
const listPendingInvites = async (userId, userEmail) => {
  return TenantMember.findAll({
      where: {
          // Busca por ID de usuário OU email (caso o ID não tenha sido vinculado no momento do convite)
          [Op.or]: [{ userId }, { email: userEmail }],
          status: 'PENDING'
      },
      include: [{ model: Tenant, as: 'tenant' }]
  });
};

/**
 * Lista convites pendentes ENVIADOS pela empresa (para o Admin gerenciar).
 */
const listSentInvites = async (tenantId) => {
  return TenantMember.findAll({
    where: {
      tenantId,
      status: 'PENDING'
    },
    attributes: ['id', 'email', 'role', 'createdAt']
  });
};

/**
 * O usuário responde a um convite (Aceitar ou Recusar).
 */
const respondToInvite = async (userId, inviteId, accept) => {
  const invite = await TenantMember.findByPk(inviteId);
  if (!invite) {
    throw new Error('Convite não encontrado.');
  }
  
  // Segurança: Garante que o convite é para este usuário
  if (invite.userId !== userId) {
      // Se o userId no convite for null, verificamos se o email bate com o do usuário
      const user = await User.findByPk(userId);
      if (user.email !== invite.email) {
          throw new Error('Este convite não pertence a você.');
      }
      // Vincula o usuário ao convite agora
      invite.userId = userId;
  }

  invite.status = accept ? 'ACTIVE' : 'DECLINED';
  await invite.save();
  
  return invite;
};

module.exports = {
  createTenantWithAdmin,
  findAllTenants,
  findTenantById,
  updateTenantById,
  listMyTenants,
  inviteMember,
  listPendingInvites,
  listSentInvites,
  respondToInvite
};