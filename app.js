// app.js
'use strict';

// 1. Carrega as variáveis de ambiente
require('dotenv').config();

// 2. Importação dos módulos
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const bcrypt = require('bcrypt');

// Importação de Rotas e Modelos
const routes = require('./src/routes');
const db = require('./src/models');
// Importamos os modelos explicitamente
const { User, Tenant, Plan, TenantMember } = require('./src/models'); 
const { startReminderJob } = require('./src/services/cron.service');

// 3. Inicialização do Express
const app = express();
const PORT = process.env.PORT || 3333;

// 4. Configuração dos Middlewares
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());

// 5. Servir Arquivos Estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 6. Rotas da API
app.use('/api', routes);

// 7. Middleware de Tratamento de Erros
app.use((err, req, res, next) => {
  console.error('--- ERRO NÃO TRATADO ---');
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Ocorreu um erro interno no servidor.',
  });
});

// 8. Sincronização e Inicialização do Servidor
const startServer = async () => {
  try {
    console.log('🔌 Conectando ao banco de dados...');
    await db.sequelize.authenticate();
    console.log('✅ Conexão estabelecida.');

    // --- CORREÇÃO CRÍTICA: ALTERAR ENUMS DO POSTGRES MANUALMENTE ---
    // Isso garante que o banco aceite o valor 'SUPER_ADMIN' mesmo que o sync falhe
    try {
      console.log('🔧 Ajustando ENUMs do Banco de Dados...');
      await db.sequelize.query(`ALTER TYPE "enum_Users_role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'`);
      await db.sequelize.query(`ALTER TYPE "enum_TenantMembers_role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN'`);
    } catch (e) {
      // Se der erro (ex: não suporta IF NOT EXISTS em versões antigas), tentamos sem
      try {
        await db.sequelize.query(`ALTER TYPE "enum_Users_role" ADD VALUE 'SUPER_ADMIN'`).catch(() => {});
        await db.sequelize.query(`ALTER TYPE "enum_TenantMembers_role" ADD VALUE 'SUPER_ADMIN'`).catch(() => {});
      } catch (err) {
        console.log('ℹ️  ENUMs provavelmente já atualizados ou erro ignorável.');
      }
    }
    // ------------------------------------------------------------------

    console.log('🔄 Sincronizando modelos...');
    await db.sequelize.sync({ alter: true }); 
    console.log('✅ Modelos sincronizados.');


    // --- INÍCIO: SEED DE SUPER ADMIN ---
    console.log('🌱 Executando Seed...');

    // A. Planos
    const enterprisePlan = await Plan.findOne({ where: { slug: 'empresa' } }) || await Plan.create({
        name: 'Empresa',
        slug: 'empresa',
        price: 79.90,
        userLimit: 10,
        documentLimit: 100,
        features: ['API completa', 'Branding completo']
    });
    await Plan.bulkCreate([
        { name: 'Básico', slug: 'basico', price: 29.90, userLimit: 3, documentLimit: 20 },
        { name: 'Profissional', slug: 'profissional', price: 49.90, userLimit: 5, documentLimit: 50 }
    ], { ignoreDuplicates: true });

    // B. Tenant
    const [mainTenant] = await Tenant.findOrCreate({
        where: { slug: 'main-org' },
        defaults: {
            name: 'Organização Principal (Super Admin)',
            status: 'ACTIVE',
            planId: enterprisePlan.id
        }
    });

    // C. Usuário SUPER_ADMIN
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@doculink.com';
    const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || '123456';
    
    // Verifica se existe
    let superAdminUser = await User.findOne({ where: { email: adminEmail } });

    if (!superAdminUser) {
        const passwordHash = await bcrypt.hash(adminPass, 10);
        superAdminUser = await User.create({
            tenantId: mainTenant.id,
            name: 'Super Admin',
            email: adminEmail,
            passwordHash: passwordHash,
            role: 'SUPER_ADMIN', 
            cpf: '00000000000',
            phoneWhatsE164: '5511999999999',
            status: 'ACTIVE'
        });
        console.log(`✨ Usuário criado como SUPER_ADMIN.`);
    } else {
        // FORÇA A ATUALIZAÇÃO SEMPRE QUE INICIAR, PARA GARANTIR
        // Usamos .update direto no modelo para evitar instâncias desatualizadas
        await User.update({ role: 'SUPER_ADMIN' }, { where: { id: superAdminUser.id } });
        console.log(`✅ Usuário ${adminEmail} forçado para SUPER_ADMIN.`);
        
        // Recarrega o usuário atualizado
        superAdminUser = await User.findByPk(superAdminUser.id);
    }

    // D. Membro SUPER_ADMIN
    const memberRecord = await TenantMember.findOne({
        where: { userId: superAdminUser.id, tenantId: mainTenant.id }
    });

    if (memberRecord) {
        await TenantMember.update({ role: 'SUPER_ADMIN' }, { where: { id: memberRecord.id } });
        console.log(`✅ Membro forçado para SUPER_ADMIN.`);
    } else {
        await TenantMember.create({
            userId: superAdminUser.id,
            tenantId: mainTenant.id,
            email: superAdminUser.email,
            role: 'SUPER_ADMIN',
            status: 'ACTIVE'
        });
        console.log(`✅ Membro criado como SUPER_ADMIN.`);
    }
    
    console.log('🌱 Seed finalizado.');
    // --- FIM DO SEED ---


    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      startReminderJob();
    });

  } catch (error) {
    console.error('❌ Falha ao iniciar o servidor:', error);
    process.exit(1);
  }
};

startServer();