const cron = require('node-cron');
    const { Document, Signer, sequelize } = require('../models');
    const { Op } = require('sequelize');

    /**
     * Inicia o job que roda todo dia para verificar lembretes.
     */
    const startReminderJob = () => {
      // Agenda para rodar todo dia à 1 da manhã.
      cron.schedule('0 1 * * *', async () => {
        console.log('[CRON] Rodando verificação de lembretes...');
        
        const threeDaysFromNow = new Date();
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

        // Busca documentos que precisam de lembrete
        const documentsToRemind = await Document.findAll({
          where: {
            autoReminders: true,
            status: { [Op.in]: ['READY', 'PARTIALLY_SIGNED'] },
            deadlineAt: {
              [Op.between]: [new Date(), threeDaysFromNow]
            }
          },
          include: [{ model: Signer, as: 'Signers' }]
        });

        for (const doc of documentsToRemind) {
          for (const signer of doc.Signers) {
            if (signer.status === 'PENDING' || signer.status === 'VIEWED') {
              // TODO: Chamar o notificationService para enviar o e-mail de lembrete
              console.log(`[CRON] Enviando lembrete para ${signer.email} sobre o documento ${doc.title}`);
            }
          }
        }
      });
      console.log('[CRON] Agendador de lembretes iniciado.');
    };

    module.exports = { startReminderJob };