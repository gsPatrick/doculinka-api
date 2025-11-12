const { Router } = require('express');
const signatoryController = require('./signatory.controller');
const authGuard = require('../../middlewares/authGuard');

const router = Router();
router.use(authGuard);

// Rota para listar os signatários únicos de um usuário
router.get('/', signatoryController.list);
router.post('/', signatoryController.create); // <-- ADICIONE ESTA LINHA


module.exports = router;