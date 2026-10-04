import crypto from 'crypto';

/**
 * Servicio de Cifrado Simétrico para Credenciales y Tokens en Reposo (Encryption at Rest).
 * Utiliza AES-256-GCM (Galois/Counter Mode) con clave derivada de 256 bits y Auth Tag
 * para garantizar máxima seguridad y protección contra alteraciones.
 */
export class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.prefix = 'enc:v1:';

    const isProduction = process.env.NODE_ENV === 'production';
    const masterSecret = process.env.ENCRYPTION_KEY;

    if (isProduction && (!masterSecret || masterSecret.trim().length < 32)) {
      throw new Error(
        'FATAL: En entorno de producción (NODE_ENV=production), la variable ENCRYPTION_KEY es estrictamente obligatoria y debe contar con un mínimo de 32 caracteres (256 bits). El servidor no puede iniciar con una clave insegura por defecto.'
      );
    }

    // Clave de bóveda maestra para cifrado de credenciales (en dev/test usa clave local si no está en .env)
    const effectiveSecret =
      masterSecret ||
      process.env.JWT_SECRET ||
      'changared_dev_fallback_key_2026_test_only!';

    this.key = crypto.createHash('sha256').update(effectiveSecret).digest();
  }

  /**
   * Cifra un token o credencial sensible.
   * @param {string} plainText
   * @returns {string} Texto cifrado con prefijo 'enc:v1:<iv>:<tag>:<ciphertext>'
   */
  encrypt(plainText) {
    if (!plainText || typeof plainText !== 'string') return plainText;
    if (this.isEncrypted(plainText)) return plainText;

    const iv = crypto.randomBytes(12); // IV de 96 bits recomendado para GCM
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${this.prefix}${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Descifra un token o credencial previamente cifrada.
   * Si no tiene el formato cifrado, devuelve el valor original (compatibilidad hacia atrás).
   * @param {string} encryptedText
   * @returns {string} Texto plano original
   */
  decrypt(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string') return encryptedText;
    if (!this.isEncrypted(encryptedText)) return encryptedText;

    try {
      const parts = encryptedText.substring(this.prefix.length).split(':');
      if (parts.length !== 3) return encryptedText;

      const [ivHex, tagHex, dataHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(tagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(dataHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('[EncryptionService] Error al descifrar credencial:', err.message);
      return encryptedText;
    }
  }

  /**
   * Determina si una cadena ya está cifrada con la versión actual.
   * @param {string} text
   * @returns {boolean}
   */
  isEncrypted(text) {
    return typeof text === 'string' && text.startsWith(this.prefix);
  }

  /**
   * Enmascara un token para auditoría o visualización segura en la interfaz.
   * @param {string} token
   * @returns {string} Ej: 'EAAG••••••••1234'
   */
  maskToken(token) {
    if (!token || typeof token !== 'string') return '';
    const clean = this.isEncrypted(token) ? this.decrypt(token) : token;
    if (clean.length <= 8) return '••••••••';
    return `${clean.substring(0, 4)}••••••••${clean.substring(clean.length - 4)}`;
  }
}

export const encryptionService = new EncryptionService();
