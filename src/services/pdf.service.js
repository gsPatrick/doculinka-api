// src/services/pdf.service.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Embute as imagens das assinaturas em um documento PDF.
 * @param {string} originalPdfPath - Caminho para o PDF original.
 * @param {Array<object>} signers - Lista de signatários que assinaram.
 * @returns {Buffer} - O buffer do novo PDF com as assinaturas embutidas.
 */
const embedSignatures = async (originalPdfPath, signers) => {
  try {
    // Garante que o caminho do PDF seja absoluto
    const resolvedPdfPath = path.isAbsolute(originalPdfPath) 
      ? originalPdfPath 
      : path.join(process.cwd(), originalPdfPath);

    const pdfBuffer = await fs.readFile(resolvedPdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    // Configurações visuais
    const stampWidth = 180;
    const stampHeight = 65;
    const verticalMargin = 30; 
    const spacingBetweenStamps = 10;

    // Pega a última página
    const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
    const { width: pageWidth } = lastPage.getSize();
    const xPos = (pageWidth - stampWidth) / 2;
    
    // Filtra apenas signatários que já assinaram e têm imagem
    const signedSigners = signers.filter(s => s.status === 'SIGNED' && s.signatureArtefactPath);

    for (let i = 0; i < signedSigners.length; i++) {
      const signer = signedSigners[i];

      // LÓGICA DE CAMINHO CORRIGIDA
      // Se o caminho vier do banco como 'uploads/tenant/...', juntamos com a raiz.
      // Se já vier absoluto (o que causou o erro antes), usamos como está.
      let signatureImagePath = signer.signatureArtefactPath;
      if (!path.isAbsolute(signatureImagePath)) {
          signatureImagePath = path.join(process.cwd(), signatureImagePath);
      }

      // Verifica se arquivo existe antes de ler para evitar crash total
      try {
        const signatureImageBytes = await fs.readFile(signatureImagePath);
        const signatureImage = await pdfDoc.embedPng(signatureImageBytes);
        
        // Se o signatário salvou uma posição específica, usa ela. 
        // Caso contrário, empilha no final da última página.
        if (signer.signaturePositionX && signer.signaturePositionY && signer.signaturePositionPage) {
             const targetPageIdx = signer.signaturePositionPage - 1;
             const targetPage = pdfDoc.getPages()[targetPageIdx];
             if (targetPage) {
                 targetPage.drawImage(signatureImage, {
                     x: signer.signaturePositionX,
                     y: signer.signaturePositionY,
                     width: stampWidth,
                     height: stampHeight
                 });
             }
        } else {
            // Fallback: Empilha na última página
            const yPos = verticalMargin + (i * (stampHeight + spacingBetweenStamps));
            lastPage.drawImage(signatureImage, {
                x: xPos,
                y: yPos,
                width: stampWidth,
                height: stampHeight,
            });
        }
      } catch (err) {
          console.error(`[PDF Service] Erro ao ler assinatura de ${signer.name} em ${signatureImagePath}:`, err.message);
          // Não damos throw aqui para tentar processar os outros signatários, 
          // mas em produção isso pode invalidar o documento visualmente.
      }
    }

    const finalPdfBytes = await pdfDoc.save();
    return Buffer.from(finalPdfBytes);

  } catch (error) {
    console.error("[PDF Service] Erro crítico ao embutir assinaturas:", error);
    throw new Error("Falha ao gerar o documento final assinado.");
  }
};

module.exports = { embedSignatures };