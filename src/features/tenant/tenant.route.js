// src/features/tenant/tenant.route.js
'use strict';

const { Router } = require('express');
const tenantController = require('./tenant.controller');
const authGuard = require('../../middlewares/authGuard');
const superAdminGuard = require('../../middlewares/superAdminGuard');

const router = Router();

// =============================================================================
// 1. ROTAS PARA USUÁRIOS AUTENTICADOS (Membros e Donos)
// =============================================================================

// Obtém os detalhes do Tenant ATUAL (vinculado ao token de acesso)
// Usado para exibir informações da empresa no dashboard e verificar limites.
router.get('/my', authGuard, tenantController.getMyTenant);

// Lista todos os Tenants disponíveis para o usuário (Próprio + Convidados).
// Usado no frontend para montar o menu de "Trocar Perfil/Empresa".
router.get('/available', authGuard, tenantController.getAvailableTenants);

// Envia um convite por e-mail para adicionar um membro ao Tenant ATUAL.
// O usuário logado precisa ter permissão (verificado no service).
router.post('/invite', authGuard, tenantController.inviteUser);

// --- Gestão de Convites (Do ponto de vista de quem recebe) ---

// Lista os convites pendentes para o usuário logado.
router.get('/invites', authGuard, tenantController.getInvites);

// Aceita ou recusa um convite específico.
// Payload esperado: { "accept": true } ou { "accept": false }
router.post('/invites/:id/respond', authGuard, tenantController.respondInvite);


// =============================================================================
// 2. ROTAS DE SUPER ADMIN (Gestão da Plataforma SaaS)
// =============================================================================
// Estas rotas são protegidas por uma chave de API mestre ou role específico.

// Cria um novo tenant manualmente (Backoffice).
router.post('/', superAdminGuard, tenantController.createTenant);

// Lista todos os tenants cadastrados na plataforma.
router.get('/', superAdminGuard, tenantController.getAllTenants);

// Obtém detalhes completos de um tenant específico por ID (incluindo dados do plano).
router.get('/:id', superAdminGuard, tenantController.getTenantById);

// Atualiza dados administrativos de um tenant (Nome, Status, Plano).
router.patch('/:id', superAdminGuard, tenantController.updateTenant);

router.get('/invites/sent', tenantController.getSentInvites);


module.exports = router;