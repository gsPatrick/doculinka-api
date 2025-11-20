// src/features/subscription/subscription.controller.js
'use strict';

const subscriptionService = require('./subscription.service');

const createSubscription = async (req, res, next) => {
  try {
    const { planSlug, billingType, creditCard, creditCardHolderInfo } = req.body;
    
    if (!planSlug || !billingType) {
        return res.status(400).json({ message: 'Dados incompletos (planSlug e billingType obrigatórios).' });
    }

    const result = await subscriptionService.subscribeToPlan(
        req.user.tenantId,
        planSlug,
        { billingType, creditCard, creditCardHolderInfo }
    );

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const cancel = async (req, res, next) => {
    try {
        const result = await subscriptionService.cancelSubscription(req.user.tenantId);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

module.exports = { createSubscription, cancel };