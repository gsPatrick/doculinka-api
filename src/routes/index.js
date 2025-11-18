// src/routes/index.js

const { Router } = require('express');

const authRoutes = require('../features/auth/auth.route');
const documentRoutes = require('../features/document/document.route');
const tenantRoutes = require('../features/tenant/tenant.route');
const signerRoutes = require('../features/signer/signer.route');
const userRoutes = require('../features/user/user.route');
const contactRoutes = require('../features/contact/contact.route');
const auditRoutes = require('../features/audit/audit.route'); // <<< ADICIONAR

const router = Router();

router.use('/auth', authRoutes);
router.use('/documents', documentRoutes);
router.use('/tenants', tenantRoutes);
router.use('/sign', signerRoutes);
router.use('/users', userRoutes);
router.use('/contacts', contactRoutes);
router.use('/audit', auditRoutes); // <<< ADICIONAR

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

module.exports = router;