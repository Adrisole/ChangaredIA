import { businessService } from '../services/business.service.js';

/**
 * Controlador de Onboarding y Administración de Negocios Multi-Tenant.
 */
export const setupBusiness = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Debes iniciar sesión o registrar tu cuenta antes de crear un nuevo negocio.',
      });
    }

    const newBusiness = await businessService.setupBusiness(req.body, userId);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${baseUrl}/api/webhook/${newBusiness.id}`;

    res.status(201).json({
      success: true,
      message: `¡Empleado virtual creado exitosamente para '${newBusiness.name}'!`,
      data: {
        business: businessService.sanitizeBusiness(newBusiness),
        integration: {
          businessId: newBusiness.id,
          whatsappWebhookUrl: webhookUrl,
          instructions: 'Configura esta URL en el Webhook de WhatsApp Cloud API o envíale solicitudes POST directas de prueba.',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const listMyBusinesses = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const myBusinesses = await businessService.getBusinessesByOwnerId(userId);
    res.status(200).json({
      success: true,
      count: myBusinesses.length,
      data: myBusinesses.map(b => businessService.sanitizeBusiness(b)),
    });
  } catch (error) {
    next(error);
  }
};

export const getBusiness = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const business = await businessService.getBusinessById(businessId);

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `El negocio '${businessId}' no existe en la plataforma.`,
      });
    }

    res.status(200).json({
      success: true,
      data: businessService.sanitizeBusiness(business),
    });
  } catch (error) {
    next(error);
  }
};

export const listBusinesses = async (req, res, next) => {
  try {
    const businesses = await businessService.getAllBusinesses();
    res.status(200).json({
      success: true,
      count: businesses.length,
      data: businesses.map(b => businessService.sanitizeBusiness(b)),
    });
  } catch (error) {
    next(error);
  }
};

export const updateWhatsAppConfig = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const updated = await businessService.updateWhatsAppConfig(businessId, req.body);
    const isConfigured = Boolean(updated.whatsappConnected);

    res.status(200).json({
      success: true,
      message: isConfigured
        ? 'Credenciales de Meta guardadas. Enviá un mensaje de prueba para verificar la conexión real.'
        : 'Configuración guardada, pero faltan Phone Number ID y Access Token de Meta.',
      data: {
        businessId: updated.id,
        whatsappConnected: updated.whatsappConnected,
        status: isConfigured ? 'CONFIGURED_PENDING_TEST' : 'NOT_CONFIGURED',
        phone: updated.phone,
        whatsappPhoneNumberId: updated.whatsappPhoneNumberId,
        hasAccessToken: Boolean(updated.whatsappAccessToken),
        hasAppSecret: Boolean(updated.whatsappAppSecret),
        tokenConfigured: Boolean(updated.whatsappAccessToken),
        tokenEncrypted: true,
      },
    });
  } catch (error) {
    next(error);
  }
};
