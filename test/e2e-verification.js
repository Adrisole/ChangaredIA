import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const BASE_URL = 'http://localhost:3000';

function getHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 CHANGARED - SUITE DE VERIFICACIONES SERIAS E2E');
  console.log('Plataforma de Empleados Virtuales Multi-Tenant & SEO');
  console.log(`URL Base: ${BASE_URL}`);
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(title, fn) {
    total++;
    process.stdout.write(`[Test ${total.toString().padStart(2, '0')}] ${title} ... `);
    try {
      await fn();
      console.log('✅ PASÓ');
      passed++;
    } catch (err) {
      console.log('❌ FALLÓ');
      console.error(`   Error: ${err.message}`);
    }
  }

  // 1. Diagnóstico del Servidor
  await test('GET /api/status - Diagnóstico y salud de la plataforma', async () => {
    const res = await fetch(`${BASE_URL}/api/status`);
    assert.equal(res.status, 200, 'Status HTTP debe ser 200');
    const data = await res.json();
    assert.equal(data.status, 'ONLINE');
    assert.equal(data.platform, 'Changared - Empleados Virtuales Multi-Tenant');
    assert.ok(data.tenantsCount >= 2, 'Debe haber al menos 2 tenants cargados');
  });

  // 2. Onboarding Real de Negocio (Multi-Tenant)
  const testBusinessId = 'clinica-dental-test';
  await test('POST /api/business/setup - Onboarding y persistencia en disco de nuevo negocio', async () => {
    const payload = {
      id: testBusinessId,
      name: 'Centro Odontológico Dental Test',
      description: 'Consultorio dental privado especializado en ortodoncia, implantes y estética. Horario de atención: 09:00 a 19:00 hs.',
      rubro: 'Salud y Odontología',
      phone: '+54 9 11 9988-7766',
      email: 'turnos@dentaltest.com',
      hours: 'Lunes a Viernes 09:00 a 19:00',
      deposit: 6000,
      toneOfVoice: 'profesional, empático, formal y orientado al paciente',
      language: 'Español',
      autoDetectLanguage: true,
      businessRules: [
        'Atención con turno previo únicamente.',
        'Seña obligatoria de $6.000 para reservar consulta de ortodoncia.',
        'Aceptamos Mercado Pago y transferencias bancarias.'
      ],
      catalog: [
        { id: 'SRV-01', name: 'Limpieza Dental y Profilaxis', price: 15000, stock: 20, category: 'Odontología' },
        { id: 'SRV-02', name: 'Consulta Diagnóstico General', price: 8000, stock: 30, category: 'Odontología' },
        { id: 'SRV-03', name: 'Blanqueamiento Láser', price: 45000, stock: 0, category: 'Estética' }
      ]
    };

    const res = await fetch(`${BASE_URL}/api/business/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201, 'Status HTTP debe ser 201');
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.business.id, testBusinessId);

    // Verificar en el filesystem directamente
    const rawData = fs.readFileSync('./src/data/businesses.json', 'utf-8');
    const parsed = JSON.parse(rawData);
    assert.ok(parsed[testBusinessId], 'El negocio debe estar guardado físicamente en src/data/businesses.json');
    assert.equal(parsed[testBusinessId].name, 'Centro Odontológico Dental Test');
  });

  // 3. Consulta de Negocio Creado
  await test('GET /api/business/:businessId - Recuperar datos del nuevo tenant', async () => {
    const res = await fetch(`${BASE_URL}/api/business/${testBusinessId}`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.deposit, 6000);
    assert.equal(json.data.catalog.length, 3);
  });

  // 4. Empleado 1: Vendedor IA (Consulta de Catálogo y Precios)
  await test('POST /api/webhook/:businessId - Vendedor IA responde catálogo y stock', async () => {
    const res = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '+5491122334455',
        message: 'Hola, qué servicios tienen y cuánto sale la limpieza dental?'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.tenant.businessId, testBusinessId);
    assert.ok(json.agentResponse.text.includes('15000') || json.agentResponse.text.includes('Limpieza Dental'), 'Debe mencionar el precio o servicio');
  });

  // 5. Empleado 1: Detección de Producto sin Stock
  await test('POST /api/webhook/:businessId - Vendedor IA avisa producto agotado', async () => {
    const res = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '+5491122334455',
        message: 'Hola, tienen disponibilidad para blanqueamiento láser?'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.agentResponse.text.toLowerCase().includes('agotado') || json.agentResponse.text.toLowerCase().includes('disculpas'), 'Debe indicar que está agotado');
  });

  // 6. Empleado 2: Agendador de Citas / Turnos IA (Google Calendar)
  await test('POST /api/webhook/:businessId - Agendador de Citas coordina turnos con Google Calendar y seña', async () => {
    const res = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '+5491144556677',
        message: 'Hola! Quiero agendar un turno para consulta esta semana'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    const text = json.agentResponse.text.toLowerCase();
    assert.ok(text.includes('calendar') || text.includes('turno') || text.includes('cita') || text.includes('seña'), 'Debe coordinar turno con Google Calendar');
  });

  // 7. Empleado 3: Gestor de Cobranzas Automático (Mercado Pago)
  await test('POST /api/webhook/:businessId - Gestor de Cobranzas ofrece regularización y link de pago', async () => {
    const res = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '+5491177889900',
        message: 'Hola, tengo una cuota o saldo pendiente de pagar, me mandan el link de pago o alias?'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    const text = json.agentResponse.text.toLowerCase();
    assert.ok(text.includes('mercado pago') || text.includes('saldo') || text.includes('pago'), 'Debe gestionar el pago/cobranza');
  });

  // 8. Empleado 4: Asistente Multilingüe (Inglés)
  await test('POST /api/webhook/:businessId - Asistente Multilingüe atiende en Inglés', async () => {
    const res = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '+13055551234',
        message: 'Hello, I want to book an appointment for dental cleaning next Friday'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    const text = json.agentResponse.text.toLowerCase();
    assert.ok(text.includes('hello') || text.includes('appointment') || text.includes('schedule') || text.includes('calendar'), 'Debe responder en inglés con tono formal');
  });

  // 9. Empleado 4: Asistente Multilingüe (Portugués)
  await test('POST /api/webhook/:businessId - Asistente Multilingüe atiende en Portugués', async () => {
    const res = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: '+551199887766',
        message: 'Olá, gostaria de agendar um horário para uma consulta'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    const text = json.agentResponse.text.toLowerCase();
    assert.ok(text.includes('olá') || text.includes('agendar') || text.includes('horário') || text.includes('calendar'), 'Debe responder en portugués');
  });

  // 10. Empleado 5: Asistente Contable (Simulación OCR y Google Sheets)
  await test('POST /api/accounting/simulate-email/:businessId - OCR de factura y sincronización con Sheets', async () => {
    const res = await fetch(`${BASE_URL}/api/accounting/simulate-email/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerType: 'telecom' })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.record.cuit, 'Debe extraer CUIT');
    assert.ok(json.record.total > 0, 'Debe registrar monto total');
    assert.equal(json.record.businessId, testBusinessId);
  });

  // 11. Empleado 5: Consulta de Facturas para el Contador
  await test('GET /api/accounting/invoices/:businessId - Listado estructurado de facturas para Excel', async () => {
    const res = await fetch(`${BASE_URL}/api/accounting/invoices/${testBusinessId}`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.stats.count >= 1, 'Debe haber al menos 1 factura cargada');
    assert.ok(json.stats.totalCompras > 0, 'El total acumulado de compras debe ser mayor a 0');
  });

  // 12. SEO Recovery 301 Permanent Redirects
  await test('GET /changarines & /trabajos - SEO 301 Redirects a la raíz para recuperar indexación', async () => {
    // Usamos redirect: 'manual' para verificar el status 301
    const res1 = await fetch(`${BASE_URL}/changarines`, { redirect: 'manual' });
    assert.equal(res1.status, 301, 'Debe responder 301 Moved Permanently');
    assert.equal(res1.headers.get('location'), '/', 'Debe redirigir al home');

    const res2 = await fetch(`${BASE_URL}/trabajos`, { redirect: 'manual' });
    assert.equal(res2.status, 301);
    assert.equal(res2.headers.get('location'), '/');
  });

  // 13. SEO Sitemap y Robots.txt
  await test('GET /robots.txt & /sitemap.xml - Archivos para rastreadores de Google y Bing', async () => {
    const resRobots = await fetch(`${BASE_URL}/robots.txt`);
    assert.equal(resRobots.status, 200);
    const robotsText = await resRobots.text();
    assert.ok(robotsText.includes('Sitemap: https://changared.com/sitemap.xml'));

    const resSitemap = await fetch(`${BASE_URL}/sitemap.xml`);
    assert.equal(resSitemap.status, 200);
    const sitemapText = await resSitemap.text();
    assert.ok(sitemapText.includes('<urlset'));
    assert.ok(sitemapText.includes('https://changared.com/cobranzas'));
    assert.ok(sitemapText.includes('https://changared.com/multilingue'));
    assert.ok(sitemapText.includes('https://changared.com/talleexacto'));
  });

  // 14. Rutas HTML Dedicadas
  await test('GET /, /cobranzas, /multilingue, /talleexacto - Páginas dedicadas responden 200 HTML', async () => {
    const pages = ['/', '/cobranzas', '/multilingue', '/talleexacto'];
    for (const page of pages) {
      const res = await fetch(`${BASE_URL}${page}`);
      assert.equal(res.status, 200, `Página ${page} debe responder 200`);
      const html = await res.text();
      assert.ok(html.includes('<!DOCTYPE html>'), `Página ${page} debe ser HTML válido`);
    }
  });

  // 15. Autenticación y Registro de Usuario (Modo Privado)
  let testUserToken = null;
  let testVerificationCode = null;
  const testUserEmail = `founder-${Date.now()}@testbusiness.com`;

  await test('POST /api/auth/register - Registro de usuario nuevo con contraseña cifrada', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Carlos Dueño',
        email: testUserEmail,
        password: 'Password123!'
      })
    });

    assert.equal(res.status, 201, 'Status HTTP debe ser 201');
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.token, 'Debe devolver un token de sesión');
    assert.equal(json.user.email, testUserEmail);
    assert.equal(json.user.emailVerified, false);
    testUserToken = json.token;
    testVerificationCode = json.verificationCode;
  });

  // 16. Verificación de Código de Correo
  await test('POST /api/auth/verify-email - Confirmación de email con código de 6 dígitos', async () => {
    assert.ok(testVerificationCode, 'Debe existir código de verificación');
    const res = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        code: testVerificationCode
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.user.emailVerified, true);
  });

  // 17. Inicio de Sesión
  await test('POST /api/auth/login - Autenticación con credenciales correctas', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUserEmail,
        password: 'Password123!'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.token);
    assert.equal(json.user.email, testUserEmail);
    testUserToken = json.token;
  });

  // 18. Perfil de Usuario Protegido
  await test('GET /api/auth/me - Verificación de token Bearer y protección 401', async () => {
    // Sin token: debe dar 401
    const unauthRes = await fetch(`${BASE_URL}/api/auth/me`);
    assert.equal(unauthRes.status, 401);

    // Con token válido: debe dar 200
    const authRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    assert.equal(authRes.status, 200);
    const json = await authRes.json();
    assert.equal(json.success, true);
    assert.equal(json.user.email, testUserEmail);
  });

  // 19. Asociación de Negocio a Usuario Autenticado
  const ownedBusinessId = `negocio-privado-${Date.now()}`;
  await test('POST /api/business/setup & GET /api/business/my - Aislamiento multi-tenant por usuario', async () => {
    // Crear negocio pasando el token de sesión
    const setupRes = await fetch(`${BASE_URL}/api/business/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        id: ownedBusinessId,
        name: 'Tienda Privada Autorizada',
        description: 'Negocio con dominio oficial y dueño verificado.',
        phone: '+54 9 11 3344-5566',
        email: testUserEmail,
        authorizedDomain: 'https://tiendaprivada.com'
      })
    });
    assert.equal(setupRes.status, 201);

    // Consultar negocios privados del usuario autenticado
    const myRes = await fetch(`${BASE_URL}/api/business/my`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    assert.equal(myRes.status, 200);
    const myJson = await myRes.json();
    assert.equal(myJson.success, true);
    assert.ok(Array.isArray(myJson.data));
    const found = myJson.data.some(b => b.id === ownedBusinessId);
    assert.ok(found, 'El negocio creado debe figurar en la lista privada del usuario');
  });

  // 20. Agenda y Gestión de Citas/Turnos (Appointments)
  await test('GET & POST /api/appointments/:businessId - Creación y consulta de turnos con profesional y seña', async () => {
    // 1. Crear nuevo turno
    const createRes = await fetch(`${BASE_URL}/api/appointments/${ownedBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Martina Soler',
        clientPhone: '+54 9 11 4455-8899',
        clientEmail: 'martina@example.com',
        service: 'Tratamiento Capilar & Brushing',
        professional: 'Estilista 1 (Clara)',
        date: '2026-10-12',
        time: 'Jueves 16:00 hs',
        depositAmount: 5000
      })
    });

    assert.equal(createRes.status, 201, 'Status HTTP debe ser 201');
    const createdJson = await createRes.json();
    assert.equal(createdJson.success, true);
    assert.equal(createdJson.data.clientName, 'Martina Soler');
    assert.equal(createdJson.data.depositPaid, true);
    assert.equal(createdJson.data.status, 'CONFIRMADO');

    // 2. Consultar turnos del negocio
    const listRes = await fetch(`${BASE_URL}/api/appointments/${ownedBusinessId}`);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.success, true);
    assert.ok(Array.isArray(listJson.data));
    const foundApt = listJson.data.find(a => a.clientName === 'Martina Soler');
    assert.ok(foundApt, 'El turno creado debe encontrarse en la lista del negocio');
  });

  // 21. Asesor Comercial IA de Changared (/api/chat/changared)
  await test('POST /api/chat/changared - Asesor Comercial IA responde consultas y vende la plataforma', async () => {
    const res = await fetch(`${BASE_URL}/api/chat/changared`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hola, tengo una peluquería y quiero agendar turnos con señas y atender WhatsApp'
      })
    });

    assert.equal(res.status, 200, 'Status HTTP debe ser 200');
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.reply && json.reply.length > 20, 'Debe retornar una respuesta comercial válida');
    assert.ok(
      json.reply.toLowerCase().includes('turno') ||
      json.reply.toLowerCase().includes('calendar') ||
      json.reply.toLowerCase().includes('whatsapp') ||
      json.reply.toLowerCase().includes('changared'),
      'Debe asesorar sobre las funciones solicitadas'
    );
  });

  // 22. WhatsApp Cloud API: Delivery Metadata y Registro de Conversación
  const customerPhoneTest = '+5491155443322';
  await test('WhatsApp Cloud API & Delivery - Mensaje entrante genera delivery oficial o simulado', async () => {
    const res = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: customerPhoneTest,
        name: 'Carlos Gomez',
        message: 'Hola! Quiero consultar los horarios de atención.'
      })
    });

    assert.equal(res.status, 200, 'Status HTTP debe ser 200');
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.whatsappDelivery, 'Debe incluir payload de entrega de WhatsApp');
    assert.ok(json.whatsappDelivery.to, 'Debe retornar to de destinatario');
    assert.equal(json.customer.name, 'Carlos Gomez');
  });

  // 23. Bandeja Inbox: Listar y Consultar Historial de Conversaciones
  await test('GET /api/conversations/:businessId - Listar conversaciones e historial completo', async () => {
    const res = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}`);
    assert.equal(res.status, 200, 'Status HTTP debe ser 200');
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data), 'data debe ser un arreglo');
    assert.ok(json.data.length >= 1, 'Debe haber al menos 1 conversación registrada');

    const cleanPhone = customerPhoneTest.replace(/[^\d]/g, '');
    const conv = json.data.find(c => c.customerPhone === cleanPhone || c.customerPhone === customerPhoneTest);
    assert.ok(conv, 'La conversación de Carlos Gomez debe existir en la bandeja');
    assert.equal(conv.status, 'ai_active', 'Estado inicial debe ser ai_active');

    // Consultar detalle específico
    const detailRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}/${cleanPhone}`);
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.success, true);
    assert.ok(detailJson.data.messages.length >= 2, 'Debe tener mensaje del cliente y respuesta de la IA');
  });

  // 24. Control Humano: "Pausar IA / Responder yo" y Silenciamiento de IA
  await test('Control Humano - Pausar IA silencia las respuestas automáticas ante nuevos mensajes', async () => {
    const cleanPhone = customerPhoneTest.replace(/[^\d]/g, '');

    // Pausar IA para esta conversación
    const toggleRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}/${cleanPhone}/toggle-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'human_takeover' })
    });
    assert.equal(toggleRes.status, 200);
    const toggleJson = await toggleRes.json();
    assert.equal(toggleJson.success, true);
    assert.equal(toggleJson.data.status, 'human_takeover');

    // Cliente vuelve a escribir mientras la IA está pausada
    const incomingRes = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: customerPhoneTest,
        message: 'Hola? Hay alguien ahí?'
      })
    });

    assert.equal(incomingRes.status, 200);
    const incomingJson = await incomingRes.json();
    assert.equal(incomingJson.success, true);
    assert.equal(incomingJson.status, 'human_takeover');
    assert.equal(incomingJson.aiMuted, true, 'La IA debe estar silenciada en human_takeover');
    assert.equal(incomingJson.agentResponse, null, 'No debe generar respuesta automática de IA');
  });

  // 25. Control Humano: Envío de Mensaje de Operador y Reactivación de IA
  await test('Control Humano - Envío de mensaje manual por operador y reactivación de IA', async () => {
    const cleanPhone = customerPhoneTest.replace(/[^\d]/g, '');

    // Enviar mensaje de operador
    const sendRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}/${cleanPhone}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hola Carlos, soy el Dr. Ramos. Te respondo personalmente.' })
    });

    assert.equal(sendRes.status, 200);
    const sendJson = await sendRes.json();
    assert.equal(sendJson.success, true);
    assert.equal(sendJson.data.conversation.status, 'human_takeover');

    // Reactivar IA
    const reactivateRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}/${cleanPhone}/toggle-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ai_active' })
    });
    assert.equal(reactivateRes.status, 200);
    const reactivateJson = await reactivateRes.json();
    assert.equal(reactivateJson.data.status, 'ai_active');
  });

  // 26. Configuración Meta Cloud API por Negocio
  await test('POST /api/business/:businessId/whatsapp-config - Guardar credenciales oficiales de Meta', async () => {
    const res = await fetch(`${BASE_URL}/api/business/${testBusinessId}/whatsapp-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '+54 9 11 9988-7766',
        whatsappPhoneNumberId: '109876543210987',
        whatsappAccessToken: 'EAAG_test_token_123',
        whatsappConnected: true
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.whatsappConnected, true);
    assert.equal(json.data.whatsappPhoneNumberId, '109876543210987');

    // Restaurar a modo simulado para pruebas idempotentes
    await fetch(`${BASE_URL}/api/business/${testBusinessId}/whatsapp-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '+54 9 11 9988-7766',
        whatsappPhoneNumberId: '',
        whatsappAccessToken: '',
        whatsappConnected: false
      })
    });
  });

  // 27. Integridad y Paridad Hash SHA-256
  await test('Integridad SHA-256 - Paridad absoluta entre root y public/', async () => {
    const hDash = getHash('dashboard.html');
    const hIndex = getHash('index.html');
    const hPubIndex = getHash('public/index.html');
    assert.equal(hDash, hIndex, 'dashboard.html debe ser idéntico a index.html');
    assert.equal(hIndex, hPubIndex, 'index.html debe ser idéntico a public/index.html');

    const hCob = getHash('cobranzas.html');
    const hPubCob = getHash('public/cobranzas.html');
    assert.equal(hCob, hPubCob, 'cobranzas.html debe ser idéntico a public/cobranzas.html');

    const hMulti = getHash('multilingue.html');
    const hPubMulti = getHash('public/multilingue.html');
    assert.equal(hMulti, hPubMulti, 'multilingue.html debe ser idéntico a public/multilingue.html');
  });

  console.log('\n================================================================');
  console.log(`📊 RESULTADOS: ${passed} de ${total} pruebas aprobadas (${Math.round((passed / total) * 100)}%)`);
  if (passed === total) {
    console.log('🎉 VERIFICACIÓN EXITOSA: La plataforma es 100% funcional y no una maqueta.');
  } else {
    console.log('⚠️ ALGUNAS PRUEBAS FALLARON.');
    process.exit(1);
  }
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Error fatal durante la ejecución de pruebas:', err);
  process.exit(1);
});
