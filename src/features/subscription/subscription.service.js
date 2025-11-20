'use strict';

const { Tenant, Plan, User } = require('../../models');
const asaasService = require('../../services/asaas.service');

/**
 * Cria ou recupera o ID do cliente no Asaas para um determinado Tenant.
 */
const ensureAsaasCustomer = async (tenantId) => {
  const tenant = await Tenant.findByPk(tenantId, {
      include: [{ model: User, as: 'ownerUsers' }] // Pega os usuários para achar o dono
  });
  
  if (!tenant) throw new Error('Organização não encontrada.');

  // Se já tem ID, retorna
  if (tenant.asaasCustomerId) {
      return tenant.asaasCustomerId;
  }

  // Se não tem, precisamos criar.
  // Pegamos o primeiro usuário (assumindo ser o dono/criador) para os dados de contato
  // Em um cenário ideal, o Tenant teria CNPJ e endereço próprios.
  const owner = tenant.ownerUsers && tenant.ownerUsers[0];
  if (!owner) throw new Error('Organização sem proprietário definido para faturamento.');

  // Dados para criação no Asaas
  const customerData = {
      name: tenant.name,
      email: owner.email,
      cpfCnpj: owner.cpf || owner.cpfCnpj || '00000000000', // Fallback ou validação necessária
      mobilePhone: owner.phoneWhatsE164 ? owner.phoneWhatsE164.replace('55', '') : undefined, // Remove DDI BR básico
      externalReference: tenant.id
  };

  const asaasCustomer = await asaasService.createCustomer(customerData);

  // Salva no banco local
  tenant.asaasCustomerId = asaasCustomer.id;
  await tenant.save();

  return asaasCustomer.id;
};

/**
 * Assina um plano.
 * @param {string} tenantId 
 * @param {string} planSlug - Ex: 'profissional', 'empresa'
 * @param {object} paymentData - { billingType: 'PIX' | 'CREDIT_CARD', creditCard: {...} }
 */
const subscribeToPlan = async (tenantId, planSlug, paymentData) => {
    // 1. Busca Planos e Tenant
    const plan = await Plan.findOne({ where: { slug: planSlug } });
    if (!plan) throw new Error('Plano não encontrado.');
    
    if (plan.price <= 0) throw new Error('Planos gratuitos não exigem assinatura via Asaas.');

    // 2. Garante Cliente no Asaas
    const customerId = await ensureAsaasCustomer(tenantId);

    // 3. Prepara dados da assinatura
    const subscriptionData = {
        customerId,
        billingType: paymentData.billingType,
        value: parseFloat(plan.price),
        nextDueDate: new Date().toISOString().split('T')[0], // Cobra hoje
        cycle: 'MONTHLY',
        description: `Assinatura Doculink - Plano ${plan.name}`,
        externalReference: tenantId,
        ...paymentData // Espalha dados de cartão se houver
    };

    // 4. Cria Assinatura no Asaas
    const asaasSubscription = await asaasService.createSubscription(subscriptionData);

    // 5. Atualiza Tenant localmente
    const tenant = await Tenant.findByPk(tenantId);
    tenant.planId = plan.id;
    tenant.asaasSubscriptionId = asaasSubscription.id;
    tenant.subscriptionStatus = 'PENDING'; // Aguardando pagamento
    await tenant.save();

    // 6. Se for PIX, já busca o QR Code da primeira cobrança gerada
    let pixInfo = null;
    if (paymentData.billingType === 'PIX') {
        // O Asaas cria a cobrança (payment) automaticamente ao criar a assinatura
        const paymentsList = await asaasService.listSubscriptionPayments(asaasSubscription.id);
        const firstPayment = paymentsList.data && paymentsList.data[0];
        
        if (firstPayment) {
            pixInfo = await asaasService.getPixQrCode(firstPayment.id);
            // Adiciona data de vencimento e valor para o front
            pixInfo.dueDate = firstPayment.dueDate;
            pixInfo.value = firstPayment.value;
        }
    }

    return {
        subscriptionId: asaasSubscription.id,
        status: asaasSubscription.status,
        pixInfo
    };
};

/**
 * Cancela a assinatura atual.
 */
const cancelSubscription = async (tenantId) => {
    const tenant = await Tenant.findByPk(tenantId);
    if (!tenant.asaasSubscriptionId) throw new Error('Nenhuma assinatura ativa encontrada.');

    await asaasService.cancelSubscription(tenant.asaasSubscriptionId);
    
    tenant.subscriptionStatus = 'CANCELED';
    // Opcional: Reverter para plano gratuito
    const freePlan = await Plan.findOne({ where: { slug: 'basico' } }); // ou free se existir
    if (freePlan) tenant.planId = freePlan.id;
    
    await tenant.save();
    return { message: 'Assinatura cancelada.' };
};

module.exports = {
    ensureAsaasCustomer,
    subscribeToPlan,
    cancelSubscription
};
