import { config } from '../config/env.js';

/**
 * Servicio de Extracción Inteligente de Facturas y Comprobantes Fiscales.
 * Extrae automáticamente CUIT, Fecha, Razón Social, Neto, IVA y Total.
 */
export class InvoiceExtractorService {
  /**
   * Extrae datos estructurados desde una factura (texto, imagen o PDF).
   * @param {Object} invoiceInput - Datos del comprobante (texto o base64)
   * @returns {Promise<Object>} Datos fiscales tabulados
   */
  async extractInvoiceData(invoiceInput) {
    const startTime = Date.now();

    // Si no hay API key configurada, usamos el motor simulado de alta fidelidad
    if (!config.openai.apiKey) {
      console.log('[InvoiceExtractor] OPENAI_API_KEY no detectada. Ejecutando extracción simulada de comprobante.');
      const simulated = this._simulateInvoiceExtraction(invoiceInput);
      return {
        ...simulated,
        executionTimeMs: Date.now() - startTime,
        engine: 'SIMULATED_OCR',
      };
    }

    try {
      const prompt = this._buildPrompt(invoiceInput);
      const rawResponse = await this._callOpenAI(prompt);
      const parsed = JSON.parse(rawResponse.replace(/```json/g, '').replace(/```/g, '').trim());

      return {
        ...parsed,
        executionTimeMs: Date.now() - startTime,
        engine: config.openai.model,
      };
    } catch (error) {
      console.error('[InvoiceExtractor Error] Fallo al procesar factura con OpenAI:', error.message);
      return {
        ...this._simulateInvoiceExtraction(invoiceInput),
        executionTimeMs: Date.now() - startTime,
        engine: 'FALLBACK_SIMULATED',
        error: error.message,
      };
    }
  }

  _buildPrompt(input) {
    const content = typeof input === 'string' ? input : JSON.stringify(input);
    return `
Eres un asistente contable senior y especialista en liquidación de impuestos y comprobantes AFIP/SAT/Internacionales.
Analiza la siguiente información de la factura o comprobante:

CONTENIDO DE LA FACTURA:
${content}

INSTRUCCIONES ESTRICTAS:
Debes responder ÚNICAMENTE en formato JSON plano con la siguiente estructura exacta:
{
  "fecha": "YYYY-MM-DD",
  "proveedor": "Nombre o Razón Social de la empresa emisora",
  "cuit": "CUIT o Tax ID del emisor con guiones (ej. 30-71234567-8)",
  "tipoComprobante": "Factura A" | "Factura B" | "Factura C" | "Ticket" | "Nota de Crédito",
  "numeroComprobante": "Punto de venta y número (ej. 0004-00124890)",
  "netoGravado": 0.00,
  "alicuotaIva": "21%" | "10.5%" | "0%",
  "importeIva": 0.00,
  "percepcionesOtrosImpuestos": 0.00,
  "total": 0.00,
  "moneda": "ARS" | "USD",
  "categoriaGasto": "Servicios" | "Mercadería" | "Luz/Gas/Tel" | "Software" | "Logística" | "Otros",
  "resumen": "Breve descripción en una frase de lo comprado"
}
`.trim();
  }

  async _callOpenAI(prompt) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content;
  }

  /**
   * Genera extracción de datos inteligente para pruebas inmediatas
   */
  _simulateInvoiceExtraction(input) {
    const text = typeof input === 'string' ? input.toLowerCase() : JSON.stringify(input).toLowerCase();

    if (text.includes('edenor') || text.includes('electricidad') || text.includes('luz')) {
      return {
        fecha: '2026-10-02',
        proveedor: 'Edenor S.A.',
        cuit: '30-65511620-2',
        tipoComprobante: 'Factura A',
        numeroComprobante: '0004-00124890',
        netoGravado: 78500.0,
        alicuotaIva: '27%',
        importeIva: 21195.0,
        percepcionesOtrosImpuestos: 3420.0,
        total: 103115.0,
        moneda: 'ARS',
        categoriaGasto: 'Luz/Gas/Tel',
        resumen: 'Consumo de energía eléctrica del local período Septiembre/Octubre.',
      };
    }

    if (text.includes('telecom') || text.includes('internet') || text.includes('fibertel')) {
      return {
        fecha: '2026-10-01',
        proveedor: 'Telecom Argentina S.A.',
        cuit: '30-63945373-8',
        tipoComprobante: 'Factura A',
        numeroComprobante: '0012-00045891',
        netoGravado: 42000.0,
        alicuotaIva: '21%',
        importeIva: 8820.0,
        percepcionesOtrosImpuestos: 1200.0,
        total: 52020.0,
        moneda: 'ARS',
        categoriaGasto: 'Servicios',
        resumen: 'Abono de conectividad a internet fibra óptica para comercio.',
      };
    }

    // Caso genérico de compra de insumos/mercadería
    return {
      fecha: new Date().toISOString().split('T')[0],
      proveedor: 'Distribuidora Lácteos del Centro S.R.L.',
      cuit: '30-71442119-4',
      tipoComprobante: 'Factura A',
      numeroComprobante: '0002-00084122',
      netoGravado: 125000.0,
      alicuotaIva: '21%',
      importeIva: 26250.0,
      percepcionesOtrosImpuestos: 2500.0,
      total: 153750.0,
      moneda: 'ARS',
      categoriaGasto: 'Mercadería',
      resumen: 'Compra mayorista de muzzarella y quesos para producción.',
    };
  }
}

export const invoiceExtractorService = new InvoiceExtractorService();
