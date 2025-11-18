// src/features/audit/audit.controller.js
'use strict';

const auditService = require('./audit.service');

const getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, action, search } = req.query;
    
    // O tenantId vem do usuário logado (req.user) via authGuard
    const logs = await auditService.listLogs(req.user.tenantId, {
      page,
      limit,
      action,
      search
    });

    res.status(200).json(logs);
  } catch (error) {
    next(error);
  }
};

module.exports = { getLogs };