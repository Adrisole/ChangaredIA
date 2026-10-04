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

  // 2. Onboarding Real de Negocio (Multi-Tenant y Autenticación Obligatoria)
  const testBusinessId = 'clinica-dental-test';
  let testUserToken = null;
  let testVerificationCode = null;
  const testUserEmail = `founder-${Date.now()}@testbusiness.com`;

  await test('POST /api/business/setup - Protección 401 sin sesión y onboarding de tenant autenticado', async () => {
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

    // 1. Intentar dar de alta sin autenticación -> Debe ser rechazado con 401
    const unauthRes = await fetch(`${BASE_URL}/api/business/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(unauthRes.status, 401, 'POST /api/business/setup debe requerir obligatoriamente sesión activa (401)');
    const unauthJson = await unauthRes.json();
    assert.equal(unauthJson.error, 'UNAUTHORIZED');

    // 2. Registrar usuario propietario para asociar el negocio legítimamente
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Carlos Dueño',
        email: testUserEmail,
        password: 'Password123!'
      })
    });
    assert.equal(regRes.status, 201);
    const regJson = await regRes.json();
    testUserToken = regJson.token;
    testVerificationCode = regJson.verificationCode;

    // 3. Crear negocio con sesión autenticada
    const res = await fetch(`${BASE_URL}/api/business/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201, 'Status HTTP debe ser 201');
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.business.id, testBusinessId);
    assert.ok(json.data.business.ownerId, 'El negocio creado debe poseer un ownerId asociado');

    // Verificar en el filesystem directamente
    const rawData = fs.readFileSync('./src/data/businesses.json', 'utf-8');
    const parsed = JSON.parse(rawData);
    assert.ok(parsed[testBusinessId], 'El negocio debe estar guardado físicamente en src/data/businesses.json');
    assert.equal(parsed[testBusinessId].name, 'Centro Odontológico Dental Test');
    assert.ok(parsed[testBusinessId].ownerId, 'El negocio en disco debe incluir su ownerId');
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
  let additionalUserToken = null;
  let additionalVerificationCode = null;
  const additionalUserEmail = `founder-2-${Date.now()}@testbusiness.com`;

  await test('POST /api/auth/register - Registro de usuario nuevo con contraseña cifrada', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Carlos Dueño 2',
        email: additionalUserEmail,
        password: 'Password123!'
      })
    });

    assert.equal(res.status, 201, 'Status HTTP debe ser 201');
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.token, 'Debe devolver un token de sesión');
    assert.equal(json.user.email, additionalUserEmail);
    assert.equal(json.user.emailVerified, false);
    additionalUserToken = json.token;
    additionalVerificationCode = json.verificationCode;
  });

  // 16. Verificación de Código de Correo
  await test('POST /api/auth/verify-email - Confirmación de email con código de 6 dígitos', async () => {
    assert.ok(additionalVerificationCode, 'Debe existir código de verificación');
    const res = await fetch(`${BASE_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: additionalUserEmail,
        code: additionalVerificationCode
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
        email: additionalUserEmail,
        password: 'Password123!'
      })
    });

    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.token);
    assert.equal(json.user.email, additionalUserEmail);
    additionalUserToken = json.token;
  });

  // 18. Perfil de Usuario Protegido
  await test('GET /api/auth/me - Verificación de token Bearer y protección 401', async () => {
    // Sin token: debe dar 401
    const unauthRes = await fetch(`${BASE_URL}/api/auth/me`);
    assert.equal(unauthRes.status, 401);

    // Con token válido: debe dar 200
    const authRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${additionalUserToken}` }
    });
    assert.equal(authRes.status, 200);
    const json = await authRes.json();
    assert.equal(json.success, true);
    assert.equal(json.user.email, additionalUserEmail);
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
    // 1. Acceso sin sesión debe ser rechazado con 401
    const unauthRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}`);
    assert.equal(unauthRes.status, 401, 'Acceso a bandeja sin token debe dar 401');

    // 2. Acceso con dueño legítimo
    const res = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
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
    const detailRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}/${cleanPhone}`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    assert.equal(detailJson.success, true);
    assert.ok(detailJson.data.messages.length >= 2, 'Debe tener mensaje del cliente y respuesta de la IA');
  });

  // 24. Control Humano: "Pausar IA / Responder yo" y Silenciamiento de IA
  await test('Control Humano - Pausar IA silencia las respuestas automáticas ante nuevos mensajes', async () => {
    const cleanPhone = customerPhoneTest.replace(/[^\d]/g, '');

    // Pausar IA para esta conversación con autorización del dueño
    const toggleRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}/${cleanPhone}/toggle-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
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

    // Enviar mensaje de operador con autorización
    const sendRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}/${cleanPhone}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify({ text: 'Hola Carlos, soy el Dr. Ramos. Te respondo personalmente.' })
    });

    assert.equal(sendRes.status, 200);
    const sendJson = await sendRes.json();
    assert.equal(sendJson.success, true);
    assert.equal(sendJson.data.conversation.status, 'human_takeover');

    // Reactivar IA con autorización
    const reactivateRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}/${cleanPhone}/toggle-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
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

  // 28. Asistente Contable: Validación Fiscal AFIP, Bandeja de Revisión, Aprobación y Borrado Real
  await test('Asistente Contable - Validación CUIT Módulo 11, Carga Manual, Aprobación y Borrado', async () => {
    // 1. Validación de CUIT oficial
    const resValValid = await fetch(`${BASE_URL}/api/accounting/validate-cuit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuit: '30-70804470-5' })
    });
    assert.equal(resValValid.status, 200);
    const jsonValValid = await resValValid.json();
    assert.equal(jsonValValid.valid, true, 'CUIT válido debe ser aceptado por Módulo 11');

    const resValInvalid = await fetch(`${BASE_URL}/api/accounting/validate-cuit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuit: '11111111111' })
    });
    const jsonValInvalid = await resValInvalid.json();
    assert.equal(jsonValInvalid.valid, false, 'CUIT inválido debe ser rechazado');

    // 2. Carga Manual
    const resCreate = await fetch(`${BASE_URL}/api/accounting/invoices/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'Distribuidora Mayorista Test SA',
        cuit: '30-70804470-5',
        invoiceNumber: 'A-0001-00009999',
        invoiceType: 'Factura A',
        date: '2026-10-04',
        neto: 10000,
        alicuota: 21,
        iva: 2100,
        percepciones: 0,
        total: 12100,
        category: 'Insumos'
      })
    });
    assert.equal(resCreate.status, 201);
    const jsonCreate = await resCreate.json();
    assert.equal(jsonCreate.success, true);
    assert.equal(jsonCreate.record.status, 'pending');
    assert.equal(jsonCreate.fiscalValidation.isValidCuit, true);
    const createdId = jsonCreate.record.id;

    // 3. Revisión y Aprobación
    const resApprove = await fetch(`${BASE_URL}/api/accounting/invoices/${testBusinessId}/${createdId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        notes: 'Aprobado formalmente para liquidación de IVA compras'
      })
    });
    assert.equal(resApprove.status, 200);
    const jsonApprove = await resApprove.json();
    assert.equal(jsonApprove.success, true);
    assert.equal(jsonApprove.record.status, 'approved');
    assert.ok(jsonApprove.record.auditTrail.length >= 2, 'Debe registrar traza de auditoría');

    // 4. Borrado individual
    const resDel = await fetch(`${BASE_URL}/api/accounting/invoices/${testBusinessId}/${createdId}`, {
      method: 'DELETE'
    });
    assert.equal(resDel.status, 200);
    const jsonDel = await resDel.json();
    assert.equal(jsonDel.success, true);

    // 5. Vaciado de comprobantes demo
    const resClearDemo = await fetch(`${BASE_URL}/api/accounting/invoices/${testBusinessId}?onlyDemo=true`, {
      method: 'DELETE'
    });
    assert.equal(resClearDemo.status, 200);
    const jsonClearDemo = await resClearDemo.json();
    assert.equal(jsonClearDemo.success, true);
  });

  // 29. Seguridad y Control de Propiedad (Multi-Tenant Authorization en Chats y Configuración)
  await test('Seguridad y Propiedad - Protección 401/403 en Chats y Configuración de Negocio', async () => {
    // 1. Acceder a conversaciones de ownedBusinessId sin token debe retornar 401
    const unauthChatRes = await fetch(`${BASE_URL}/api/conversations/${ownedBusinessId}`);
    assert.equal(unauthChatRes.status, 401, 'Debe requerir autenticación para acceder a chats de negocio privado');

    // 2. Crear un segundo usuario (intruso / otro tenant)
    const otherEmail = `otro-usuario-${Date.now()}@example.com`;
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherEmail, password: 'Password123!', name: 'Otro Usuario' })
    });
    const regJson = await regRes.json();
    const otherToken = regJson.token;

    // 3. El segundo usuario intenta acceder a los chats del primer negocio -> debe dar 403 FORBIDDEN
    const forbiddenChatRes = await fetch(`${BASE_URL}/api/conversations/${ownedBusinessId}`, {
      headers: { 'Authorization': `Bearer ${otherToken}` }
    });
    assert.equal(forbiddenChatRes.status, 403, 'Usuario ajeno debe recibir 403 Forbidden al consultar chats');

    // 4. El segundo usuario intenta cambiar la configuración de WhatsApp del primer negocio -> debe dar 403
    const forbiddenConfigRes = await fetch(`${BASE_URL}/api/business/${ownedBusinessId}/whatsapp-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${otherToken}`
      },
      body: JSON.stringify({ phone: '+5491100000000', whatsappPhoneNumberId: '999999999' })
    });
    assert.equal(forbiddenConfigRes.status, 403, 'Usuario ajeno no debe poder modificar configuración de WhatsApp');

    // 5. El dueño legítimo accede a sus conversaciones -> 200 OK
    const ownerChatRes = await fetch(`${BASE_URL}/api/conversations/${ownedBusinessId}`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    assert.equal(ownerChatRes.status, 200, 'El dueño legítimo debe tener acceso 200 OK a sus chats');
  });

  // 30. Cifrado en Reposo de Tokens y Secrets de Meta (AES-256-GCM) y Prevención de Fugas de Información
  await test('Cifrado de Tokens y Secrets - Credenciales en disco cifradas con AES-256-GCM y enmascaradas en API', async () => {
    // 1. Guardar credenciales de Meta (Access Token y App Secret) con el token del dueño
    const rawMetaToken = 'EAAG_super_secret_meta_cloud_token_xyz_987654';
    const rawMetaSecret = 'meta_secret_key_prod_vault_998877';
    const configRes = await fetch(`${BASE_URL}/api/business/${ownedBusinessId}/whatsapp-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        phone: '+54 9 11 3344-5566',
        whatsappPhoneNumberId: '123456789012345',
        whatsappAccessToken: rawMetaToken,
        whatsappAppSecret: rawMetaSecret,
        whatsappConnected: true
      })
    });
    assert.equal(configRes.status, 200);
    const configJson = await configRes.json();
    assert.equal(configJson.data.hasAccessToken, true);
    assert.equal(configJson.data.hasAppSecret, true);
    assert.equal(configJson.data.tokenEncrypted, true);

    // 2. Leer directamente el archivo businesses.json del disco y comprobar que NO contienen las credenciales en texto plano
    const rawDisk = fs.readFileSync('./src/data/businesses.json', 'utf-8');
    assert.ok(!rawDisk.includes(rawMetaToken), 'El token plano NUNCA debe estar en texto legible en el disco');
    assert.ok(!rawDisk.includes(rawMetaSecret), 'El App Secret plano NUNCA debe estar en texto legible en el disco');
    const parsedDisk = JSON.parse(rawDisk);
    const storedBiz = parsedDisk[ownedBusinessId];
    assert.ok(storedBiz.whatsappAccessToken.startsWith('enc:v1:'), 'El token debe estar cifrado con formato enc:v1:');
    assert.equal(storedBiz.whatsappAccessToken.split(':').length, 5, 'Debe contener prefijo enc, version v1, IV, AuthTag y Ciphertext');
    assert.ok(storedBiz.whatsappAppSecret.startsWith('enc:v1:'), 'El App Secret debe estar cifrado con formato enc:v1:');
    assert.equal(storedBiz.whatsappAppSecret.split(':').length, 5, 'App Secret cifrado debe contener IV, AuthTag y Ciphertext');

    // 3. Comprobar que en GET /api/business/:businessId las credenciales no se exponen a clientes
    const getBizRes = await fetch(`${BASE_URL}/api/business/${ownedBusinessId}`);
    assert.equal(getBizRes.status, 200);
    const getBizJson = await getBizRes.json();
    assert.equal(getBizJson.data.whatsappAccessToken, undefined, 'El token secreto debe estar eliminado de la respuesta JSON');
    assert.equal(getBizJson.data.whatsappAppSecret, undefined, 'El App Secret debe estar eliminado de la respuesta JSON');
    assert.equal(getBizJson.data.hasAccessToken, true);
    assert.equal(getBizJson.data.hasAppSecret, true);
    assert.ok(getBizJson.data.whatsappAccessTokenMasked.includes('••••••••'));
  });

  // 31. Validación Criptográfica de Firma Webhook de Meta (x-hub-signature-256 HMAC-SHA256)
  await test('Firma Real de Webhook - Validación HMAC-SHA256 contra Meta App Secret con rawBody', async () => {
    const testSecret = 'meta_app_secret_changared_test_hash_2026';

    // 1. Configurar whatsappAppSecret en el negocio con el token del dueño
    const setSecretRes = await fetch(`${BASE_URL}/api/business/${ownedBusinessId}/whatsapp-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        whatsappAppSecret: testSecret
      })
    });
    assert.equal(setSecretRes.status, 200);

    const msgPayload = JSON.stringify({
      from: '+5491155667788',
      message: 'Hola, consulta de seguridad con firma criptográfica Meta'
    });

    // 2. Envío sin firma a negocio con App Secret configurado -> Debe rechazar con 401
    const noSigRes = await fetch(`${BASE_URL}/api/webhook/${ownedBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: msgPayload
    });
    assert.equal(noSigRes.status, 401, 'Petición sin firma debe ser rechazada cuando hay App Secret');
    const noSigJson = await noSigRes.json();
    assert.equal(noSigJson.error, 'MISSING_SIGNATURE');

    // 3. Envío con firma falsa/adulterada -> Debe rechazar con 401
    const badSigRes = await fetch(`${BASE_URL}/api/webhook/${ownedBusinessId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
      },
      body: msgPayload
    });
    assert.equal(badSigRes.status, 401, 'Firma falsa debe ser rechazada');
    const badSigJson = await badSigRes.json();
    assert.equal(badSigJson.error, 'INVALID_SIGNATURE');

    // 4. Envío con firma HMAC-SHA256 auténtica calculada sobre el body exacto
    const validHmac = crypto.createHmac('sha256', testSecret).update(msgPayload).digest('hex');
    const validSigRes = await fetch(`${BASE_URL}/api/webhook/${ownedBusinessId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${validHmac}`
      },
      body: msgPayload
    });
    assert.equal(validSigRes.status, 200, 'Firma oficial válida debe ser admitida y procesada');
    const validSigJson = await validSigRes.json();
    assert.equal(validSigJson.success, true);
  });

  // 32. Deduplicación e Idempotencia de Webhook (Meta Retry Protection)
  await test('Idempotencia de Webhook - Protección contra reintentos duplicados de Meta', async () => {
    const testWamid = `wamid_dedup_test_${Date.now()}`;
    const payload = {
      id: testWamid,
      from: '+5491188776655',
      name: 'Cliente Deduplicado',
      message: 'Consulta sobre precios y turnos'
    };

    // 1. Primer envío: debe procesarse con IA
    const firstRes = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(firstRes.status, 200);
    const firstJson = await firstRes.json();
    assert.equal(firstJson.success, true);
    assert.ok(firstJson.agentResponse, 'Primer envío debe generar respuesta de IA');

    // 2. Reintento idéntico de Meta con el mismo wamid: debe retornar 200 con duplicate: true sin invocar IA
    const secondRes = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(secondRes.status, 200);
    const secondJson = await secondRes.json();
    assert.equal(secondJson.success, true);
    assert.equal(secondJson.duplicate, true, 'Debe detectar duplicado y evitar re-ejecutar');
    assert.equal(secondJson.messageId, testWamid);
  });

  // 33. Eventos de Estado de Entrega de Meta (sent -> delivered -> read)
  await test('Estados de Entrega Meta - Actualización de sent, delivered y read en historial', async () => {
    const statusWamid = `wamid_status_track_${Date.now()}`;

    // Crear mensaje inicial con dicho ID
    await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: statusWamid,
        from: '+5491199001122',
        message: 'Mensaje para rastreo de estado de entrega'
      })
    });

    // Simular webhook de Meta con evento delivered
    const statusPayload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: statusWamid,
              status: 'delivered',
              timestamp: Math.floor(Date.now() / 1000).toString(),
              recipient_id: '5491199001122'
            }]
          }
        }]
      }]
    };

    const statusRes = await fetch(`${BASE_URL}/api/webhook/${testBusinessId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(statusPayload)
    });
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.event, 'status_update');
    assert.equal(statusJson.count, 1);

    // Verificar en el historial de la conversación que el estado se actualizó
    const convRes = await fetch(`${BASE_URL}/api/conversations/${testBusinessId}/5491199001122`, {
      headers: { 'Authorization': `Bearer ${testUserToken}` }
    });
    assert.equal(convRes.status, 200);
    const convJson = await convRes.json();
    const foundMsg = convJson.data.messages.find(m => m.metaMessageId === statusWamid);
    assert.ok(foundMsg, 'El mensaje con statusWamid debe existir en el historial');
    assert.equal(foundMsg.deliveryStatus, 'delivered', 'El estado del mensaje debe haberse actualizado a delivered');
  });

  // 34. Webhook Global Meta con Resolución Automática por Phone Number ID
  await test('Webhook Global Meta - Reconocimiento de tenant por Phone Number ID y Challenge GET', async () => {
    // 1. GET /api/webhook con challenge de Meta
    const challengeRes = await fetch(`${BASE_URL}/api/webhook?hub.mode=subscribe&hub.verify_token=changared_secret_verify_token_2026&hub.challenge=META_CHALLENGE_OK_2026`);
    assert.equal(challengeRes.status, 200);
    const challengeText = await challengeRes.text();
    assert.equal(challengeText, 'META_CHALLENGE_OK_2026');

    // 2. Configurar Phone Number ID oficial en un tenant
    const uniquePhoneId = `meta_pid_${Date.now()}`;
    await fetch(`${BASE_URL}/api/business/${ownedBusinessId}/whatsapp-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        whatsappPhoneNumberId: uniquePhoneId,
        whatsappAccessToken: 'EAAG_valid_token_test',
        whatsappAppSecret: '',
        whatsappConnected: true
      })
    });

    // 3. POST /api/webhook a la raíz (sin :businessId en la URL!) en formato oficial de Meta
    const metaPayload = {
      entry: [{
        changes: [{
          value: {
            metadata: {
              phone_number_id: uniquePhoneId,
              display_phone_number: '5491133445566'
            },
            contacts: [{ profile: { name: 'Mariana López' } }],
            messages: [{
              from: '5491177665544',
              id: `wamid_global_${Date.now()}`,
              type: 'text',
              text: { body: 'Hola, consulto por atención y turnos' }
            }]
          }
        }]
      }]
    };

    const globalRes = await fetch(`${BASE_URL}/api/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaPayload)
    });
    assert.equal(globalRes.status, 200);
    const globalJson = await globalRes.json();
    assert.equal(globalJson.success, true);
    assert.equal(globalJson.tenant.businessId, ownedBusinessId, 'Debe resolver automáticamente el tenant mediante phone_number_id');
    assert.equal(globalJson.customer.name, 'Mariana López');
  });

  // 35. Seguridad y Producción: Validación Estricta de ENCRYPTION_KEY en NODE_ENV=production
  await test('Seguridad en Producción - Fallo fatal al arrancar si falta ENCRYPTION_KEY en producción', async () => {
    const { EncryptionService } = await import('../src/services/encryption.service.js');
    const oldEnv = process.env.NODE_ENV;
    const oldKey = process.env.ENCRYPTION_KEY;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ENCRYPTION_KEY;

      assert.throws(
        () => new EncryptionService(),
        /FATAL: En entorno de producción \(NODE_ENV=production\), la variable ENCRYPTION_KEY es estrictamente obligatoria/,
        'Debe lanzar error fatal de arranque si no hay ENCRYPTION_KEY en producción'
      );

      process.env.ENCRYPTION_KEY = 'clave_corta_insegura_123';
      assert.throws(
        () => new EncryptionService(),
        /FATAL: En entorno de producción \(NODE_ENV=production\), la variable ENCRYPTION_KEY es estrictamente obligatoria y debe contar con un mínimo de 32 caracteres/,
        'Debe rechazar claves de menos de 32 caracteres en producción'
      );
    } finally {
      process.env.NODE_ENV = oldEnv;
      if (oldKey !== undefined) {
        process.env.ENCRYPTION_KEY = oldKey;
      } else {
        delete process.env.ENCRYPTION_KEY;
      }
    }
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
