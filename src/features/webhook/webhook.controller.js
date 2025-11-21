// src/features/webhook/webhook.controller.js
'use strict';

const { Tenant, Plan } = require('../../models');

const handleAsaasWebhook = async (req, res, next) => {
    try {
        const { event, payment } = req.body;
        const token = req.headers['asaas-access-token']; // Asaas envia o token no header se configurado

        // Segurança básica
        if (process.env.ASAAS_WEBHOOK_TOKEN && token !== process.env.ASAAS_WEBHOOK_TOKEN) {
            return res.status(401).json({ message: 'Unauthorized Webhook' });
        }

        // --- CORREÇÃO: Validação de Existência do Objeto Payment ---
        // Se o evento não tiver um objeto 'payment', nós ignoramos (ex: SUBSCRIPTION_CREATED, CUSTOMER_UPDATED)
        if (!payment) {
            console.log(`[Webhook Asaas] Evento ignorado (sem dados de pagamento): ${event}`);
            return res.status(200).json({ received: true });
        }
        // -----------------------------------------------------------

        console.log(`[Webhook Asaas] Evento: ${event} | Payment: ${payment.id}`);

        // Precisamos achar o Tenant. O payment tem customerId e subscriptionId.
        // Buscamos pelo asaasCustomerId ou asaasSubscriptionId
        let tenant = null;
        
        if (payment.subscription) {
            tenant = await Tenant.findOne({ where: { asaasSubscriptionId: payment.subscription } });
        } else {
             tenant = await Tenant.findOne({ where: { asaasCustomerId: payment.customer } });
        }

        if (!tenant) {
            console.warn(`[Webhook] Tenant não encontrado para Customer ${payment.customer}`);
            return res.status(200).send('OK - Tenant ignored');
        }

        switch (event) {
            case 'PAYMENT_CONFIRMED':
            case 'PAYMENT_RECEIVED':
                tenant.subscriptionStatus = 'ACTIVE';
                tenant.status = 'ACTIVE'; // Caso estivesse suspenso
                await tenant.save();
                console.log(`[Webhook] Tenant ${tenant.name} ativado/renovado.`);
                break;

            case 'PAYMENT_OVERDUE':
                tenant.subscriptionStatus = 'OVERDUE';
                // Regra de negócio: Suspender acesso?
                // tenant.status = 'SUSPENDED'; 
                await tenant.save();
                console.log(`[Webhook] Tenant ${tenant.name} com pagamento atrasado.`);
                break;
            
            case 'PAYMENT_REFUNDED':
                tenant.subscriptionStatus = 'CANCELED';
                await tenant.save();
                break;
        }

        return res.status(200).json({ received: true });

    } catch (error) {
        console.error('[Webhook Error]', error);
        // Retornar 500 faz o Asaas tentar de novo
        return res.status(500).json({ error: error.message });
    }
};

module.exports = { handleAsaasWebhook };