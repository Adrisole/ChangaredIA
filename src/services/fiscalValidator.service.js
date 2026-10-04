/**
 * Servicio de Validación Fiscal y Control de Duplicados para Comprobantes AFIP / Libro IVA.
 */

/**
 * Valida un CUIT/CUIL argentino mediante el algoritmo oficial de módulo 11.
 * @param {string|number} cuitStr - CUIT con o sin guiones (11 dígitos numéricos)
 * @returns {Object} { valid: boolean, formatted: string, clean: string, reason: string }
 */
export function validateCuit(cuitStr) {
  if (!cuitStr) {
    return { valid: false, formatted: '', clean: '', reason: 'CUIT vacío o no especificado' };
  }

  const clean = String(cuitStr).replace(/[^0-9]/g, '');

  if (clean.length !== 11) {
    return { valid: false, formatted: clean, clean, reason: `Longitud incorrecta (${clean.length} dígitos en lugar de 11)` };
  }

  // Prefijos tributarios comunes en Argentina: 20, 23, 24, 27 (personas físicas), 30, 33, 34 (personas jurídicas)
  const prefix = clean.slice(0, 2);
  const validPrefixes = ['20', '23', '24', '27', '30', '33', '34'];
  if (!validPrefixes.includes(prefix)) {
    return {
      valid: false,
      formatted: `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`,
      clean,
      reason: `Prefijo tributario '${prefix}' no habitual en Argentina`
    };
  }

  // Algoritmo Módulo 11 oficial de AFIP
  const factors = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * factors[i];
  }

  const mod = sum % 11;
  let checkDigit = 11 - mod;
  if (mod === 0) checkDigit = 0;
  if (mod === 1) checkDigit = 9;

  const actualDigit = parseInt(clean[10], 10);
  const isValid = actualDigit === checkDigit;

  return {
    valid: isValid,
    formatted: `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`,
    clean,
    reason: isValid ? 'CUIT fiscalmente válido' : `Dígito verificador incorrecto (esperado ${checkDigit}, recibido ${actualDigit})`
  };
}

/**
 * Valida la consistencia aritmética de los importes contables:
 * Neto Gravado + IVA + Percepciones == Total (tolerancia de centavos).
 */
export function validateAmounts(neto, alicuotaStr, iva, percepciones, total) {
  const n = Number(neto) || 0;
  const i = Number(iva) || 0;
  const p = Number(percepciones) || 0;
  const t = Number(total) || 0;

  const calculatedTotal = Math.round((n + i + p) * 100) / 100;
  const diff = Math.abs(calculatedTotal - t);
  const isBalanced = diff <= 1.0; // tolerancia de hasta $1 ARS por redondeos en centavos

  return {
    balanced: isBalanced,
    difference: Math.round(diff * 100) / 100,
    expectedTotal: calculatedTotal,
    reason: isBalanced ? 'Cuadre aritmético correcto' : `Diferencia de $${diff.toFixed(2)} entre (Neto + IVA + Percepciones) y el Total`
  };
}

/**
 * Detecta duplicados en la lista de comprobantes existentes.
 * Un comprobante se considera duplicado si:
 * 1) Mismo CUIT emisor + mismo Punto de Venta y Número de Comprobante.
 * 2) Mismo CUIT emisor + misma Fecha + mismo Importe Total.
 */
export function detectDuplicate(existingInvoices, candidate, excludeId = null) {
  if (!Array.isArray(existingInvoices) || !candidate) {
    return { isDuplicate: false };
  }

  const cleanCandCuit = String(candidate.cuit || '').replace(/[^0-9]/g, '');
  const cleanCandNum = String(candidate.numeroComprobante || '').trim().toLowerCase();
  const candDate = String(candidate.fecha || '').trim();
  const candTotal = Number(candidate.total) || 0;

  for (const inv of existingInvoices) {
    if (excludeId && inv.id === excludeId) continue;

    const cleanCuit = String(inv.cuit || '').replace(/[^0-9]/g, '');
    const cleanNum = String(inv.numeroComprobante || '').trim().toLowerCase();
    const date = String(inv.fecha || '').trim();
    const total = Number(inv.total) || 0;

    // Regla 1: CUIT + Número de Comprobante
    if (cleanCandCuit && cleanCandNum && cleanCuit === cleanCandCuit && cleanNum === cleanCandNum) {
      return {
        isDuplicate: true,
        reason: `Comprobante duplicado: Ya existe el N° ${inv.numeroComprobante} del proveedor ${inv.proveedor} (CUIT ${inv.cuit}).`,
        existing: inv
      };
    }

    // Regla 2: CUIT + Fecha + Total
    if (cleanCandCuit && candDate && cleanCuit === cleanCandCuit && date === candDate && Math.abs(total - candTotal) < 0.05) {
      return {
        isDuplicate: true,
        reason: `Posible comprobante duplicado: Mismo proveedor (${inv.proveedor}), misma fecha (${date}) y mismo monto total ($${total}).`,
        existing: inv
      };
    }
  }

  return { isDuplicate: false };
}
