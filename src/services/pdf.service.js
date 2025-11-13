// src/services/pdf.service.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

/**
 * Embute as imagens das assinaturas em um documento PDF em posições fixas.
 * @param {string} originalPdfPath - Caminho para o PDF original.
 * @param {Array<object>} signers - Lista de signatários que assinaram.
 * @returns {Buffer} - O buffer do novo PDF com as assinaturas embutidas.
 */
const embedSignatures = async (originalPdfPath, signers) => {
  try {
    const pdfBuffer = await fs.readFile(originalPdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // --- LÓGICA DE POSICIONAMENTO FIXO ---

    // Define as dimensões do carimbo de assinatura
    const stampWidth = 180;
    const stampHeight = 65;
    const verticalMargin = 30; // Margem de baixo para o primeiro carimbo
    const spacingBetweenStamps = 10; // Espaçamento vertical entre múltiplos carimbos

    // Pega a última página do documento para adicionar as assinaturas
    const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
    const { width: pageWidth, height: pageHeight } = lastPage.getSize();
    
    // Calcula a posição X para centralizar horizontalmente
    const xPos = (pageWidth - stampWidth) / 2;
    
    // Itera sobre cada signatário para desenhar seu carimbo
    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];

      // Pula se o signatário não tiver uma imagem de assinatura salva
      if (!signer.signatureArtefactPath) {
        console.warn(`[PDF Service] Signatário ${signer.name} pulado: sem artefato de assinatura.`);
        continue;
      }

      // Carrega a imagem da assinatura
      const signatureImagePath = path.join(__dirname, '..', '..', signer.signatureArtefactPath);
      const signatureImageBytes = await fs.readFile(signatureImagePath);
      const signatureImage = await pdfDoc.embedPng(signatureImageBytes);
      
      // Calcula a posição Y para cada carimbo, empilhando-os de baixo para cima
      const yPos = verticalMargin + (i * (stampHeight + spacingBetweenStamps));

      // Desenha a imagem da assinatura na página
      lastPage.drawImage(signatureImage, {
        x: xPos,
        y: yPos,
        width: stampWidth,
        height: stampHeight,
      });

      // Opcional: Adicionar texto abaixo da assinatura (nome, data, etc.)
      // const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      // lastPage.drawText(`Assinado por: ${signer.name}`, { x: xPos, y: yPos - 12, size: 8 });
    }
    // ------------------------------------

    const finalPdfBytes = await pdfDoc.save();
    return Buffer.from(finalPdfBytes);

  } catch (error) {
    console.error("Erro ao embutir assinaturas no PDF:", error);
    throw new Error("Falha ao gerar o documento final assinado.");
  }
};

module.exports = { embedSignatures };