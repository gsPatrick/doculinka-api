// src/features/tenant/tenant.service.js
'use strict';

const { Tenant, User, Plan, TenantMember, sequelize } = require('../../models');
const notificationService = require('../../services/notification.service');
const { Op } = require('sequelize');

/**
 * Função auxiliar para gerar slugs amigáveis para URL.
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
 * Cria um novo Tenant e o usuário administrador inicial.
 * Usado no registro de nova conta.
 * @param {string} tenantName 
 * @param {object} adminUserData 
 */
const createTenantWithAdmin = async (tenantName, adminUserData) => {
  const transaction = await sequelize.transaction();
  try {
    // 1. Gera e valida o slug
    let slug = generateSlug(tenantName);
    const existingTenant = await Tenant.findOne({ where: { slug }, transaction });
    if (existingTenant) {
      slug = `${slug}-${Math.random().toString(36).substring(2, 7)}`;
    }

    // 2. Busca o plano padrão (Básico) para atribuir inicialmente
    const basicPlan = await Plan.findOne({ where: { slug: 'basico' }, transaction });

    // 3. Cria o Tenant
    const tenant = await Tenant.create({
      name: tenantName,
      slug: slug,
      status: 'ACTIVE',
      planId: basicPlan ? basicPlan.id : null
    }, { transaction });

    // 4. Cria o Usuário Dono (Admin)
    await User.create({
      tenantId: tenant.id,
      name: adminUserData.name,
      email: adminUserData.email,
      // Os outros campos (passwordHash, cpf, etc) devem ser passados no adminUserData ou tratados antes
      // Mas assumindo que este método é chamado pelo auth.service, o User.create lá já lida com tudo.
      // AQUI, apenas garantimos que o tenantId está correto.
      // OBS: Normalmente o auth.service chama o User.create diretamente. 
      // Se esta função for usada apenas para seeding ou admin super user, ok.
      // Se for usada pelo fluxo de registro normal, o auth.service geralmente orquestra.
      // Vamos manter simples: cria um user placeholder se não vier completo, 
      // mas no fluxo real o auth.service faz o trabalho pesado.
      status: 'ACTIVE'
    }, { transaction });

    await transaction.commit();
    return tenant;
  } catch (error) {
    await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new Error(`Conflito de dados ao criar organização.`);
    }
    throw error;
  }
};

/**
 * Lista todos os tenants (Uso interno/Super Admin).
 */
const findAllTenants = async () => {
  return Tenant.findAll({
    order: [['name', 'ASC']],
    include: [{ model: Plan, as: 'plan' }]
  });
};

/**
 * Busca detalhes de um tenant pelo ID, incluindo estatísticas de uso.
 * @param {string} id - ID do tenant.
 */
const findTenantById = async (id) => {
  const tenant = await Tenant.findByPk(id, {
    include: [{ model: Plan, as: 'plan' }]
  });

  if (!tenant) {
    throw new Error('Organização não encontrada.');
  }

  // Contagem de Uso
  // Usuários = Donos (na tabela User) + Membros Ativos (na tabela TenantMember)
  const ownerCount = await User.count({ where: { tenantId: id, status: { [Op.ne]: 'INACTIVE' } } });
  const memberCount = await TenantMember.count({ where: { tenantId: id, status: 'ACTIVE' } });
  const totalUsers = ownerCount + memberCount;

  // Documentos
  // Precisamos acessar o modelo Document via sequelize.models para evitar dependência circular se houver
  const documentsCount = await sequelize.models.Document.count({ where: { tenantId: id } });

  const tenantData = tenant.toJSON();
  tenantData.usage = {
    users: totalUsers,
    documents: documentsCount
  };

  return tenantData;
};

/**
 * Atualiza dados do Tenant.
 */
const updateTenantById = async (id, updateData) => {
  const tenant = await Tenant.findByPk(id);
  if (!tenant) throw new Error('Organização não encontrada.');

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
 * Lista todos os Tenants que o usuário tem acesso (Próprio + Convidados).
 * Usado para a troca de perfil/contexto.
 */
const listMyTenants = async (userId) => {
  // 1. Busca Tenant Pessoal (Onde ele é dono/criador)
  const user = await User.findByPk(userId, {
    include: [{ model: Tenant, as: 'ownTenant' }]
  });

  // 2. Busca Tenants onde ele é membro convidado e ativo
  const memberships = await TenantMember.findAll({
    where: { userId, status: 'ACTIVE' },
    include: [{ model: Tenant, as: 'tenant' }]
  });

  const list = [];
  
  // Adiciona Tenant Pessoal
  if (user.ownTenant) {
    list.push({
      id: user.ownTenant.id,
      name: user.ownTenant.name,
      role: 'ADMIN', // Dono é sempre admin da sua conta
      isPersonal: true,
      slug: user.ownTenant.slug
    });
  }

  // Adiciona Tenants Convidados
  memberships.forEach(m => {
    if (m.tenant) {
      list.push({
        id: m.tenant.id,
        name: m.tenant.name,
        role: m.role,
        isPersonal: false,
        slug: m.tenant.slug
      });
    }
  });

  return list;
};

/**
 * Envia um convite para um email participar do Tenant atual.
 * Verifica limites do plano antes de enviar.
 */
const inviteMember = async (currentTenantId, email, role = 'USER') => {
  // 1. Verifica Limite do Plano
  const tenant = await Tenant.findByPk(currentTenantId, { include: [{ model: Plan, as: 'plan' }] });
  
  if (tenant.plan) {
    const ownerCount = await User.count({ where: { tenantId: currentTenantId, status: { [Op.ne]: 'INACTIVE' } } });
    const memberCount = await TenantMember.count({ where: { tenantId: currentTenantId, status: { [Op.ne]: 'DECLINED' } } }); // Conta pendentes também como "uso reservado"
    
    if ((ownerCount + memberCount) >= tenant.plan.userLimit) {
      throw new Error(`Limite de usuários do plano "${tenant.plan.name}" atingido. Faça upgrade para convidar mais membros.`);
    }
  }

  // 2. Verifica se o usuário já existe no sistema
  const existingUser = await User.findOne({ where: { email } });

  // 3. Cria ou Atualiza o convite
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
      throw new Error('Este usuário já é um membro ativo desta organização.');
    }
    // Reativa convite se estava recusado ou atualiza dados se pendente
    member.status = 'PENDING';
    member.userId = existingUser ? existingUser.id : null;
    member.role = role;
    await member.save();
  }

  // 4. Envia Notificação (Email)
  // Se o usuário já existe, link para login/dashboard. Se não, link para registro.
  const inviteLink = existingUser 
    ? `${process.env.FRONT_URL}/dashboard` 
    : `${process.env.FRONT_URL}/register?email=${email}`;
  
  // TODO: Integrar com template real de email
  const messageHtml = `
    <p>Você foi convidado para fazer parte da organização <strong>${tenant.name}</strong>.</p>
    <p><a href="${inviteLink}">Clique aqui para aceitar o convite</a></p>
  `;

  try {
    await notificationService.sendEmail(currentTenantId, { // Passa tenantId para usar config whitelabel se houver
        to: email,
        subject: `Convite para participar de ${tenant.name}`,
        html: messageHtml
    });
  } catch (err) {
    console.error(`[InviteService] Erro ao enviar email para ${email}:`, err);
    // Não falha a requisição se o email falhar, mas avisa no log
  }

  return member;
};

/**
 * Lista convites pendentes para o usuário logado.
 * Busca tanto pelo ID (se já vinculado) quanto pelo email.
 */
const listPendingInvites = async (userId, userEmail) => {
    return TenantMember.findAll({
        where: {
            [Op.or]: [
                { userId: userId },
                { email: userEmail }
            ],
            status: 'PENDING'
        },
        include: [{ model: Tenant, as: 'tenant' }]
    });
};

/**
 * Aceita ou recusa um convite.
 */
const respondToInvite = async (userId, inviteId, accept) => {
    const invite = await TenantMember.findByPk(inviteId);
    
    if (!invite) {
        throw new Error('Convite não encontrado.');
    }
    
    // Validação de segurança: o convite pertence a quem está chamando?
    if (invite.userId !== userId) {
        const user = await User.findByPk(userId);
        if (user.email !== invite.email) {
            throw new Error('Você não tem permissão para responder a este convite.');
        }
        // Se o email bate mas o userId estava null, vincula agora
        invite.userId = userId;
    }

    if (invite.status !== 'PENDING') {
        throw new Error('Este convite já foi respondido anteriormente.');
    }

    invite.status = accept ? 'ACTIVE' : 'DECLINED';
    await invite.save();
    
    return invite;
};

const listSentInvites = async (tenantId) => {
  return TenantMember.findAll({
    where: {
      tenantId,
      status: 'PENDING'
    },
    attributes: ['id', 'email', 'role', 'createdAt']
  });
};

module.exports = {
  createTenantWithAdmin,
  findAllTenants,
  findTenantById,
  updateTenantById,
  listMyTenants,
  inviteMember,
  listPendingInvites,
  respondToInvite,
  listSentInvites
};