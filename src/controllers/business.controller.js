import { businessService } from '../services/business.service.js';

/**
 * Controlador de Onboarding y Administración de Negocios Multi-Tenant.
 */
export const setupBusiness = (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const newBusiness = businessService.setupBusiness(req.body, userId);

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

export const listMyBusinesses = (req, res, next) => {
  try {
    const userId = req.user.id;
    const myBusinesses = businessService.getBusinessesByOwnerId(userId);
    res.status(200).json({
      success: true,
      count: myBusinesses.length,
      data: myBusinesses.map(b => businessService.sanitizeBusiness(b)),
    });
  } catch (error) {
    next(error);
  }
};

export const getBusiness = (req, res, next) => {
  try {
    const { businessId } = req.params;
    const business = businessService.getBusinessById(businessId);

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

export const listBusinesses = (req, res, next) => {
  try {
    const businesses = businessService.getAllBusinesses();
    res.status(200).json({
      success: true,
      count: businesses.length,
      data: businesses.map(b => businessService.sanitizeBusiness(b)),
    });
  } catch (error) {
    next(error);
  }
};

export const updateWhatsAppConfig = (req, res, next) => {
  try {
    const { businessId } = req.params;
    const updated = businessService.updateWhatsAppConfig(businessId, req.body);

    res.status(200).json({
      success: true,
      message: 'Configuración de WhatsApp actualizada exitosamente.',
      data: {
        businessId: updated.id,
        whatsappConnected: updated.whatsappConnected,
        phone: updated.phone,
        whatsappPhoneNumberId: updated.whatsappPhoneNumberId,
        hasAccessToken: Boolean(updated.whatsappAccessToken),
        tokenEncrypted: true,
      },
    });
  } catch (error) {
    next(error);
  }
};
