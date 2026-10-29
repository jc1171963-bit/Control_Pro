// Prueba E2E en navegador real contra la API real (Flask + PostgreSQL).
const { chromium } = require('playwright');
const BASE = process.env.E2E_BASE || 'http://localhost:4173';
const SHOTS = process.argv[2] || '/tmp';
const PW = 'ControlPro2026';
const errores = [];

async function nuevaPagina(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|401|404|409|Failed to load resource/.test(m.text())) errores.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => { errores.push('dialog inesperado: ' + d.message()); d.dismiss(); });
  return page;
}
const paso = (t) => console.log('▶', t);

(async () => {
  const browser = await chromium.launch();

  // ---------------- Tienda: cliente compra con envío y transferencia
  const c = await nuevaPagina(browser);
  paso('inicio');
  await c.goto(BASE + '/');
  await c.getByRole('heading', { name: /Uniformes listos para trabajar/ }).waitFor();
  await c.screenshot({ path: `${SHOTS}/01-inicio.png`, fullPage: true });

  paso('catálogo con filtro de categoría y búsqueda');
  await c.goto(BASE + '/catalogo?categoria=batas');
  await c.getByRole('heading', { name: 'Batas' }).waitFor();
  await c.goto(BASE + '/catalogo?q=polo');
  await c.getByText('Polo corporativa piqué').first().waitFor();
  await c.screenshot({ path: `${SHOTS}/02-catalogo.png` });

  paso('ficha de producto y redirección a login');
  await c.getByText('Polo corporativa piqué').first().click();
  await c.getByRole('heading', { name: 'Polo corporativa piqué' }).waitFor();
  await c.getByRole('button', { name: 'G', exact: true }).click();
  await c.screenshot({ path: `${SHOTS}/03-producto.png` });
  await c.getByRole('button', { name: 'Agregar al carrito' }).click();
  await c.waitForURL(/\/entrar/);
  await c.fill('input[name=correo]', 'cliente@demo.mx');
  await c.fill('input[name=password]', PW);
  await c.getByRole('button', { name: 'Entrar' }).click();
  await c.waitForURL(/\/producto\//);
  await c.getByRole('button', { name: 'G', exact: true }).click();
  await c.getByRole('button', { name: 'Más' }).click();
  await c.getByRole('button', { name: 'Agregar al carrito' }).click();
  await c.getByText(/Agregaste 2/).waitFor();

  paso('carrito y checkout por pasos');
  await c.goto(BASE + '/carrito');
  await c.getByRole('heading', { name: 'Tu carrito' }).waitFor();
  await c.screenshot({ path: `${SHOTS}/04-carrito.png` });
  await c.getByRole('link', { name: /Continuar con la compra/ }).click();
  await c.getByRole('heading', { name: 'Finalizar compra' }).waitFor();
  await c.getByRole('button', { name: 'Continuar al pago' }).click();
  await c.getByRole('button', { name: 'Revisar pedido' }).click();
  await c.screenshot({ path: `${SHOTS}/05-checkout.png` });
  await c.getByRole('button', { name: 'Confirmar pedido' }).click();
  await c.waitForURL(/\/cuenta\/pedidos\/\d+\?nuevo=1/);
  const pedidoUrl = c.url().split('?')[0];
  await c.getByText(/Pedido PED-/).first().waitFor();
  paso('registrar transferencia');
  await c.fill('input[placeholder="Ej. clave de rastreo SPEI"]', 'SPEI-E2E-0001');
  await c.getByRole('button', { name: 'Registrar pago' }).click();
  await c.getByText('Tu pago está en validación').waitFor();
  await c.screenshot({ path: `${SHOTS}/06-pedido-cliente.png`, fullPage: true });
  const folio = (await c.getByText(/Pedido PED-\d{4}-\d+/).first().textContent()).match(/PED-\d{4}-\d+/)[0];
  console.log('   folio', folio);

  // ---------------- Finanzas valida
  const f = await nuevaPagina(browser);
  paso('finanzas valida el pago');
  await f.goto(BASE + '/admin/entrar');
  await f.fill('input[name=correo]', 'finanzas@controlpro.mx');
  await f.fill('input[name=password]', PW);
  await f.getByRole('button', { name: 'Entrar al panel' }).click();
  await f.waitForURL(BASE + '/admin');
  await f.goto(BASE + '/admin/pagos');
  const fila = f.locator('tr', { hasText: folio });
  await fila.getByRole('button', { name: 'Validar' }).click();
  await f.getByRole('button', { name: 'Confirmar' }).click();
  await f.getByText('Registro actualizado.').waitFor();

  // ---------------- Almacén surte y despacha
  paso('admin revisa el pedido y la sucursal asignada');
  const a = await nuevaPagina(browser);
  await a.goto(BASE + '/admin/entrar');
  await a.fill('input[name=correo]', 'admin@controlpro.mx');
  await a.fill('input[name=password]', PW);
  await a.getByRole('button', { name: 'Entrar al panel' }).click();
  await a.waitForURL(BASE + '/admin');
  await a.getByText('Ventas registradas').first().waitFor();
  await a.screenshot({ path: `${SHOTS}/07-dashboard.png`, fullPage: true });
  await a.goto(BASE + '/admin/pedidos');
  await a.getByRole('link', { name: folio }).click();
  await a.getByText('Surtido por sucursal').waitFor();
  const sucursal = (await a.locator('text=/Sucursal (Toluca|Querétaro|Puebla)/').first().textContent()).trim();
  const codigo = { 'Sucursal Toluca': 'tol', 'Sucursal Querétaro': 'qro', 'Sucursal Puebla': 'pue' }[sucursal];
  await a.screenshot({ path: `${SHOTS}/08-pedido-admin.png`, fullPage: true });

  paso(`almacén ${codigo} surte, empaca y despacha`);
  const w = await nuevaPagina(browser);
  await w.goto(BASE + '/admin/entrar');
  await w.fill('input[name=correo]', `almacen.${codigo}@controlpro.mx`);
  await w.fill('input[name=password]', PW);
  await w.getByRole('button', { name: 'Entrar al panel' }).click();
  await w.waitForURL(BASE + '/admin');
  await w.goto(BASE + '/admin/surtido');
  await w.locator('tr', { hasText: folio }).getByRole('link', { name: 'Atender' }).click();
  await w.getByRole('button', { name: 'Iniciar surtido' }).click();
  await w.getByText('Surtido iniciado').waitFor();
  await w.getByRole('button', { name: 'Registrar surtido' }).click();
  await w.getByRole('button', { name: 'Guardar surtido' }).click();
  await w.getByText('Surtido registrado.').waitFor();
  await w.getByRole('button', { name: 'Crear paquete' }).first().click();
  await w.getByRole('dialog').getByRole('button', { name: 'Crear paquete' }).click();
  await w.getByText('Paquete creado.').waitFor();
  await w.getByRole('button', { name: 'Despachar' }).click();
  await w.fill('input[placeholder="Nombre de la paquetería o reparto propio"]', 'Reparto propio');
  await w.getByRole('dialog').locator('input').nth(1).fill('RP-E2E-001');
  await w.getByRole('button', { name: 'Confirmar' }).click();
  await w.getByText('Paquete actualizado.').waitFor();
  await w.getByRole('button', { name: 'Registrar evento' }).click();
  await w.getByRole('dialog').locator('select').selectOption('entregado');
  await w.getByRole('dialog').locator('textarea').fill('Recibió Andrea Morales en domicilio');
  await w.getByRole('button', { name: 'Confirmar' }).click();
  await w.getByText('Paquete actualizado.').first().waitFor();
  await w.screenshot({ path: `${SHOTS}/09-surtido.png`, fullPage: true });

  paso('cliente ve el pedido entregado');
  await c.goto(pedidoUrl);
  await c.getByText('Entregado').first().waitFor();
  await c.getByRole('button', { name: 'Solicitar devolución' }).waitFor();

  // ---------------- Navegación por todos los módulos del panel
  paso('recorrido de módulos del panel (admin)');
  for (const ruta of ['pedidos', 'pagos', 'clientes', 'surtido', 'inventario', 'transferencias', 'devoluciones', 'incidencias', 'catalogo', 'catalogo/1', 'promociones', 'reportes', 'sucursales', 'usuarios', 'auditoria', 'notificaciones']) {
    await a.goto(`${BASE}/admin/${ruta}`);
    await a.locator('main h1').first().waitFor();
    await a.waitForLoadState('networkidle');
  }
  await a.goto(`${BASE}/admin/inventario`);
  await a.locator('tbody tr').first().waitFor();
  await a.screenshot({ path: `${SHOTS}/10-inventario.png` });

  paso('encargado de Toluca no ve el menú de usuarios ni otras sucursales');
  const e = await nuevaPagina(browser);
  await e.goto(BASE + '/admin/entrar');
  await e.fill('input[name=correo]', 'encargado.tol@controlpro.mx');
  await e.fill('input[name=password]', PW);
  await e.getByRole('button', { name: 'Entrar al panel' }).click();
  await e.waitForURL(BASE + '/admin');
  if (await e.getByRole('link', { name: 'Usuarios y roles' }).count()) errores.push('El encargado ve Usuarios y roles');
  await e.goto(BASE + '/admin/inventario');
  await e.locator('tbody tr').first().waitFor();
  const sucursalesVistas = new Set(await e.locator('tbody tr td:first-child').allTextContents());
  if ([...sucursalesVistas].some((s) => s !== 'Sucursal Toluca')) errores.push('El encargado ve inventario de otras sucursales: ' + [...sucursalesVistas]);

  // ---------------- Cuenta corporativa: arma un pedido por empleado
  paso('empresa arma un pedido corporativo con excepción');
  const emp = await nuevaPagina(browser);
  await emp.goto(BASE + '/entrar');
  await emp.fill('input[name=correo]', 'empresa@demo.mx');
  await emp.fill('input[name=password]', PW);
  await emp.getByRole('button', { name: 'Entrar' }).click();
  await emp.waitForURL(/\/cuenta/);
  await emp.goto(BASE + '/cuenta/corporativo/nuevo');
  await emp.getByLabel('Empleado partida 1').selectOption({ label: 'Juan Pérez · Administración' });
  await emp.getByLabel('Producto partida 1').selectOption({ label: 'Botas de seguridad dieléctricas' });
  await emp.getByLabel('Talla partida 1').locator('option').nth(3).waitFor({ state: 'attached' });
  await emp.getByLabel('Talla partida 1').selectOption({ index: 3 });
  await emp.getByPlaceholder('Justificación (mínimo 10 caracteres)').fill('Recorre el área de mantenimiento a diario');
  await emp.screenshot({ path: `${SHOTS}/11-corporativo.png`, fullPage: true });
  await emp.getByRole('button', { name: 'Enviar a revisión' }).click();
  await emp.waitForURL(/\/cuenta\/pedidos\/\d+/);
  await emp.getByText('En revisión').first().waitFor();

  paso('vista móvil');
  const m = await nuevaPagina(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await m.goto(BASE + '/');
  await m.getByRole('heading', { name: /Uniformes listos/ }).waitFor();
  await m.screenshot({ path: `${SHOTS}/12-movil.png`, fullPage: false });
  const ancho = await m.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 392) errores.push(`Desbordamiento horizontal en móvil: ${ancho}px`);

  await browser.close();
  console.log('\nERRORES:', errores.length ? errores : 'ninguno');
  process.exit(errores.length ? 1 : 0);
})().catch((e) => { console.error('FALLO:', e.message); console.log('ERRORES previos:', errores); process.exit(2); });
