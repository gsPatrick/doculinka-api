// src/features/document/document.route.js

const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const documentController = require('./document.controller');
const authGuard = require('../../middlewares/authGuard');

const router = Router();

// Configuração do Multer (Temporário para upload e Memória para validação)
const uploadTemp = multer({
  dest: path.join(__dirname, '..', '..', '..', 'temp_uploads/'),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// Multer em Memória (Para o validador, não precisamos salvar o arquivo, só ler o buffer)
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// --- ROTAS DE VALIDAÇÃO E INTEGRIDADE ---

// 1. Validador de Arquivo (Upload do PDF para checar se é original) - PÚBLICA ou PROTEGIDA
// Se quiser público, remova o authGuard. Se for interno, mantenha.
router.post('/validate-file', uploadMemory.single('file'), documentController.validateFile);

// 2. Verificar Cadeia de Custódia (Hash Chain) de um documento específico
router.get('/:id/verify-chain', authGuard, documentController.verifyChain);

// --- ROTAS EXISTENTES ---
router.post('/', authGuard, uploadTemp.single('documentFile'), documentController.createDocument);
router.post('/:id/invite', authGuard, documentController.inviteSigners);
router.get('/:id', authGuard, documentController.getDocumentById);
router.get('/:id/audit', authGuard, documentController.getDocumentAuditTrail);
router.get('/:id/download', authGuard, documentController.downloadDocumentFile);
router.patch('/:id', authGuard, documentController.updateDocument);
router.post('/:id/cancel', authGuard, documentController.cancelDocument);
router.post('/:id/expire', authGuard, documentController.expireDocument);
router.post('/:id/pades', authGuard, documentController.applyPades);
router.get('/', authGuard, documentController.getAllDocuments);
router.get('/stats', authGuard, documentController.getStats);

module.exports = router;