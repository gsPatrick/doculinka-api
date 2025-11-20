// src/features/tenant/tenant.route.js
'use strict';

const { Router } = require('express');
const tenantController = require('./tenant.controller');
const authGuard = require('../../middlewares/authGuard');
const adminGuard = require('../../middlewares/adminGuard'); // Admin do Tenant
const superAdminGuard = require('../../middlewares/superAdminGuard'); // Super Admin do Sistema

const router = Router();

// 1. Proteção Básica: Todo acesso a tenants exige login
router.use(authGuard);


// --- ROTAS ESPECÍFICAS (DEVEM VIR PRIMEIRO) ---

// Rotas de Usuário Comum (Troca de Contexto / Visualização)
// "available" e "my" são palavras fixas, devem ser checadas antes de tentar interpretar como ID
router.get('/available', tenantController.getAvailableTenants);
router.get('/my', tenantController.getMyTenant);


// Rotas de Convites (Usuário Comum - Recebidos)
router.get('/invites/pending', tenantController.getInvites);
router.post('/invites/:id/respond', tenantController.respondInvite);


// Rotas de Admin do Tenant (Gestão de Equipe)
router.post('/invite', adminGuard, tenantController.inviteUser);
router.get('/invites/sent', adminGuard, tenantController.getSentInvites);


// --- ROTAS DO SUPER ADMIN ---

// Listar todos (Rota específica)
router.get('/all', superAdminGuard, tenantController.getAllTenants);

// Criar Tenant (Root)
router.post('/', superAdminGuard, tenantController.createTenant);


// --- ROTAS DINÂMICAS (DEVEM VIR POR ÚLTIMO) ---

// Buscar Tenant por ID (Super Admin)
// Se esta rota estivesse no topo, ela capturaria "/available" como sendo um ID
router.get('/:id', superAdminGuard, tenantController.getTenantById);

// Atualizar Tenant (Super Admin)
router.patch('/:id', superAdminGuard, tenantController.updateTenant);


module.exports = router;