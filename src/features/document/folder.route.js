// src/features/document/folder.route.js
'use strict';

const { Router } = require('express');
const folderController = require('./folder.controller');
const authGuard = require('../../middlewares/authGuard');
const roleGuard = require('../../middlewares/roleGuard');

const router = Router();

// 1. Proteção Básica: Todas as rotas exigem login
router.use(authGuard);

// --- ROTAS DE LEITURA (Acessíveis por todos os níveis) ---

/**
 * @route   GET /api/folders
 * @desc    Lista o conteúdo (pastas e arquivos) de um diretório ou realiza busca.
 * @query   parentId (opcional), search (opcional)
 * @access  ADMIN, MANAGER, VIEWER
 */
router.get('/', roleGuard(['ADMIN', 'MANAGER', 'VIEWER']), folderController.list);


// --- ROTAS DE ESCRITA (Apenas ADMIN e MANAGER) ---

/**
 * @route   POST /api/folders
 * @desc    Cria uma nova pasta.
 * @body    { name, parentId }
 * @access  ADMIN, MANAGER
 */
router.post('/', roleGuard(['ADMIN', 'MANAGER']), folderController.create);

/**
 * @route   POST /api/folders/move
 * @desc    Move um arquivo ou pasta para outro local.
 * @body    { itemId, itemType, targetFolderId }
 * @access  ADMIN, MANAGER
 */
router.post('/move', roleGuard(['ADMIN', 'MANAGER']), folderController.move);

/**
 * @route   DELETE /api/folders/:id
 * @desc    Deleta uma pasta (e move seus arquivos para a raiz/lixeira).
 * @access  ADMIN, MANAGER
 */
router.delete('/:id', roleGuard(['ADMIN', 'MANAGER']), folderController.remove);

router.patch('/:id', roleGuard(['ADMIN', 'MANAGER']), folderController.rename);


module.exports = router;