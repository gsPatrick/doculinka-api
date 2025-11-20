'use strict';

const axios = require('axios');

class AsaasService {
  constructor() {
    this.api = axios.create({
      baseURL: process.env.ASAAS_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'access_token': process.env.ASAAS_API_KEY
      }
    });
  }

  // --- GESTÃO DE CLIENTES ---

  async createCustomer(customerData) {
    try {
      const response = await this.api.post('/customers', {
        name: customerData.name,
        email: customerData.email,
        cpfCnpj: customerData.cpfCnpj,
        phone: customerData.phone,
        mobilePhone: customerData.mobilePhone,
        postalCode: customerData.postalCode,
        address: customerData.address,
        addressNumber: customerData.addressNumber,
        notificationDisabled: false
      });
      return response.data;
    } catch (error) {
      console.error('[Asaas] Erro ao criar cliente:', error.response?.data || error.message);
      throw new Error(`Erro na integração Asaas (Cliente): ${JSON.stringify(error.response?.data?.errors)}`);
    }
  }

  async getCustomer(customerId) {
    try {
      const response = await this.api.get(`/customers/${customerId}`);
      return response.data;
    } catch (error) {
        // Se for 404, retorna null
       if (error.response && error.response.status === 404) return null;
       throw error;
    }
  }

  // --- ASSINATURAS ---

  async createSubscription(subscriptionData) {
    try {
      const payload = {
        customer: subscriptionData.customerId,
        billingType: subscriptionData.billingType, // 'CREDIT_CARD', 'PIX', 'BOLETO'
        value: subscriptionData.value,
        nextDueDate: subscriptionData.nextDueDate,
        cycle: subscriptionData.cycle || 'MONTHLY',
        description: subscriptionData.description,
        externalReference: subscriptionData.externalReference
      };

      // Adiciona dados de cartão se necessário
      if (subscriptionData.billingType === 'CREDIT_CARD' && subscriptionData.creditCard) {
        payload.creditCard = subscriptionData.creditCard;
        payload.creditCardHolderInfo = subscriptionData.creditCardHolderInfo;
      }

      // Se for Token de cartão (preferível)
      if (subscriptionData.billingType === 'CREDIT_CARD' && subscriptionData.creditCardToken) {
          payload.creditCardToken = subscriptionData.creditCardToken;
      }

      const response = await this.api.post('/subscriptions', payload);
      return response.data;
    } catch (error) {
      console.error('[Asaas] Erro ao criar assinatura:', error.response?.data || error.message);
      throw new Error(`Erro na integração Asaas (Assinatura): ${JSON.stringify(error.response?.data?.errors)}`);
    }
  }

  async getSubscription(subscriptionId) {
    const response = await this.api.get(`/subscriptions/${subscriptionId}`);
    return response.data;
  }

  async cancelSubscription(subscriptionId) {
      const response = await this.api.delete(`/subscriptions/${subscriptionId}`);
      return response.data;
  }

  // --- COBRANÇAS E PIX ---

  async listSubscriptionPayments(subscriptionId) {
    const response = await this.api.get('/payments', {
      params: { subscription: subscriptionId }
    });
    return response.data; // Retorna objeto com { data: [...] }
  }

  async getPixQrCode(paymentId) {
    try {
        const response = await this.api.get(`/payments/${paymentId}/pixQrCode`);
        return response.data;
    } catch (error) {
        console.error('[Asaas] Erro ao gerar PIX:', error.response?.data);
        throw error;
    }
  }
}

module.exports = new AsaasService();