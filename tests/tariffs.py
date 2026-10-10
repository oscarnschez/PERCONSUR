"""Tarifas (Administración): apartado BAYER INBOUND 2026 (División Campo), zonas, búsqueda, edición (agregar, cambiar, eliminar),
apartados nuevos con su división, División Puerto (origen Manzanillo, ciudad destino, cargos adicionales), importes antes de
impuestos, respaldo y PDF. Requiere pdftotext y pdfinfo (poppler-utils)."""
import subprocess, time, sys, os, re, json
from playwright.sync_api import sync_playwright
APP=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); os.makedirs('shots',exist_ok=True)
U=os.environ['PCS_TEST_USER']; P=os.environ['PCS_TEST_PASS']; BASE='http://127.0.0.1:8776/index.html'
srv=subprocess.Popen([sys.executable,'-m','http.server','8776','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
log=[]; errs=[]
def ok(c,m): log.append(('OK  ' if c else 'FAIL')+' '+m)
def cards(pg): return pg.locator('.tf-card').count()
def origins(pg): return [t.strip() for t in pg.locator('.tf-o').all_inner_texts()]
def card(pg,name): return pg.locator('.tf-card').filter(has=pg.locator('.tf-o',has_text=re.compile('^'+re.escape(name)+'$')))
def form(pg): pg.wait_for_selector('.op-form'); pg.wait_for_timeout(350)
def submit(pg): pg.locator('.op-form button[type=submit]').click(); pg.wait_for_timeout(500)
def errors(pg): return [t for t in pg.locator('.op-form .has-err .ferr').all_inner_texts() if t]
BACKUP_JS = """async()=>{const B=await import('/src/services/backup.js'); const f=await B.exportBackup(); const info=await B.inspectBackup(f);
  const d=JSON.parse(await f.text()).data.tariffSheets; return {lines:info.lines, n:d.length, sayula:d[0].routes.find(r=>r.origin==='Sayula').rates.Tolva}}"""
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,service_workers='block',accept_downloads=True)
    ctx.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login',state='detached'); pg.wait_for_timeout(900)
    if pg.locator('.asheet').count(): pg.get_by_role('button',name='Ahora no').click()
    # Administración → Tarifas → BAYER INBOUND 2026
    pg.goto(BASE+'#/administracion'); pg.wait_for_timeout(700)
    mc=pg.locator('a.mod-card[href="#/tarifas"]')
    ok(mc.count()==1 and 'Tarifas' in mc.inner_text() and '1 apartado | 85 rutas' in mc.inner_text(),'Administración: tarjeta Tarifas con 1 apartado y 85 rutas')
    mc.click(); pg.wait_for_timeout(600)
    ok(pg.locator('a.mod-card',has_text='BAYER INBOUND 2026').count()==1 and '85 rutas | 41 orígenes | 6 zonas' in pg.locator('a.mod-card').first.inner_text() and 'División Campo' in pg.locator('a.mod-card').first.inner_text(),'Tarifas: apartado BAYER INBOUND 2026 de División Campo (85 rutas, 41 orígenes, 6 zonas)')
    ok('antes de impuestos' in pg.locator('.page-lead').inner_text(),'Tarifas: se indica que las tarifas son antes de impuestos')
    pg.screenshot(path='shots/tf1_apartados.png')
    pg.locator('a.mod-card',has_text='BAYER INBOUND 2026').click(); pg.wait_for_selector('.tf-card'); pg.wait_for_timeout(400)
    sid=pg.url.split('#/tarifas/')[1]
    zs=[t.strip() for t in pg.locator('.tf-zone .sec-h').all_inner_texts()]
    ok(pg.locator('.tf-div').inner_text().strip().upper()=='DIVISIÓN CAMPO' and 'antes de impuestos' in pg.locator('.page-lead').inner_text(),'el apartado muestra su división y que los importes son antes de impuestos')
    ok(pg.locator('h1.title').inner_text()=='BAYER INBOUND 2026' and zs==['Occidente','Pacífico','Bajío zona A','Bajío zona B','Bajío zona C','Bajío zona D'] and cards(pg)==41,'el apartado se organiza por zonas: 6 zonas y 41 ciudades de origen')
    t=card(pg,'Sayula').inner_text()
    ok('$21,200.00' in t and '$17,200.00' in t and 'Mochis' not in t and pg.locator('text=Torton').count()==0,'Sayula: Nextipac Tolva $21,200 y Jaula $17,200; sin rutas sin monto ni Torton')
    pg.screenshot(path='shots/tf2_bayer.png')
    # Búsqueda y filtros
    pg.fill('[data-text]','penjamo'); pg.wait_for_timeout(300)
    ok(origins(pg)==['Pénjamo'] and '2 rutas encontradas' in pg.locator('.tf-count').inner_text(),'buscar «penjamo» encuentra Pénjamo (2 rutas)')
    pg.fill('[data-text]',''); pg.locator('[data-dest="Planta Los Mochis"]').click(); pg.wait_for_timeout(300)
    ok(cards(pg)==3 and pg.locator('.tf-t tbody tr').count()==3,'planta destino Los Mochis: 3 rutas')
    pg.locator('[data-dest=""]').click(); pg.locator('[data-zone="Bajío zona A"]').click(); pg.wait_for_timeout(300)
    ok([t.strip() for t in pg.locator('.tf-zone .sec-h').all_inner_texts()]==['Bajío zona A'] and cards(pg)==9,'zona Bajío zona A: 9 orígenes')
    pg.fill('[data-text]','zzz'); pg.wait_for_timeout(300)
    ok(pg.locator('.empty',has_text='Sin tarifas').count()==1,'sin coincidencias: aviso «Sin tarifas»')
    pg.locator('[data-clear]').click(); pg.wait_for_timeout(300)
    ok(cards(pg)==41,'«Quitar filtros» vuelve a mostrar todo')
    # Editar una tarifa
    card(pg,'Sayula').locator('tr[data-route]').first.click(); form(pg)
    ok(pg.locator('.op-form [name=zone]').input_value()=='Occidente' and pg.locator('.op-form [name=Tolva]').input_value()=='21200.00' and pg.locator('.op-form [data-del]').count()==1,'editar: el formulario trae zona, origen, planta y montos, con opción de eliminar')
    pg.fill('.op-form [name=Tolva]','22000'); submit(pg)
    ok('$22,000.00' in card(pg,'Sayula').inner_text() and '$17,200.00' in card(pg,'Sayula').inner_text(),'Sayula → Nextipac Tolva actualizada a $22,000')
    # Agregar: validaciones y tarifa con un solo monto
    pg.locator('[data-add]').first.click(); form(pg)
    pg.fill('.op-form [name=zone]','Occidente'); pg.fill('.op-form [name=origin]','sayula'); pg.fill('.op-form [name=dest]','Planta Nextipac'); pg.fill('.op-form [name=Jaula]','1000'); submit(pg)
    ok(errors(pg)==['Ya existe la ruta Sayula → Nextipac en este apartado.'],'no permite repetir origen y planta en el apartado')
    pg.fill('.op-form [name=origin]','Ameca'); pg.fill('.op-form [name=Jaula]',''); submit(pg)
    ok(errors(pg)==['Captura al menos un monto (Tolva o Jaula).'],'pide al menos un monto (el aviso anterior desaparece)')
    pg.fill('.op-form [name=Jaula]','15500'); pg.screenshot(path='shots/tf3_agregar.png'); submit(pg)
    t=card(pg,'Ameca').inner_text()
    ok('$15,500.00' in t and '—' in t and '86' in pg.locator('[data-tiles]').inner_text(),'tarifa agregada: Ameca → Nextipac solo Jaula $15,500 (Tolva sin tarifa)')
    # Eliminar
    card(pg,'Ameca').locator('tr[data-route]').first.click(); form(pg); pg.locator('.op-form [data-del]').click(); pg.wait_for_timeout(400)
    pg.locator('.as-wrap button',has_text='Eliminar').last.click(); pg.wait_for_timeout(600)
    ok(card(pg,'Ameca').count()==0 and '85' in pg.locator('[data-tiles]').inner_text(),'tarifa eliminada')
    # Persistencia
    pg.reload(); pg.wait_for_selector('.tf-card'); pg.wait_for_timeout(500)
    ok('$22,000.00' in card(pg,'Sayula').inner_text() and card(pg,'Ameca').count()==0,'los cambios persisten al recargar')
    # Respaldo
    bk=pg.evaluate(BACKUP_JS)
    ok(bk['n']==1 and bk['sayula']==2200000 and 'Tarifas: 1 apartado, 85 rutas' in bk['lines'],'el respaldo incluye el apartado con la tarifa editada')
    # PDF
    pg.locator('[data-pdf]').click(); pg.wait_for_selector('.eo-page',timeout=20000); pg.wait_for_timeout(800)
    n=pg.locator('.eo-page').count(); svg=pg.locator('[data-pages]').inner_html()
    ok(n>=3 and 'BAYER INBOUND 2026' in svg and '$22,000.00' in svg,f'vista previa del PDF: {n} páginas con el apartado y la tarifa editada')
    pg.screenshot(path='shots/tf4_pdf.png')
    pg.locator('[data-act="generate"]').click(); pg.wait_for_selector('.stmt-ok',timeout=20000); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.locator('[data-act="save"]').click()
    path=d.value.path(); txt=subprocess.run(['pdftotext','-layout',path,'-'],capture_output=True,text=True).stdout
    pages=int(re.search(r'Pages:\s+(\d+)',subprocess.run(['pdfinfo',path],capture_output=True,text=True).stdout).group(1))
    ok(d.value.suggested_filename.startswith('Tarifas-BAYER-INBOUND-2026-') and pages==n,'PDF generado: '+d.value.suggested_filename+f' ({pages} páginas, igual que la vista previa)')
    ok(all(x in txt for x in ['BAYER INBOUND 2026','OCCIDENTE','BAJÍO ZONA D','Sayula','$22,000.00',f'Página {pages} de {pages}']),'el PDF tiene texto real: apartado, zonas, ciudades, montos y numeración')
    # Apartados: nuevo, cambiar nombre y eliminar
    pg.goto(BASE+'#/tarifas'); pg.wait_for_timeout(500)
    pg.locator('[data-add]').first.click(); form(pg); pg.fill('.op-form [name=name]','bayer inbound 2026'); submit(pg)
    ok(errors(pg)==['Ya existe el apartado «bayer inbound 2026».'],'no se repite el nombre de un apartado')
    segs=[t.strip() for t in pg.locator('.op-form [data-div]').all_inner_texts()]
    ok(segs==['Puerto','Campo'] and pg.locator('.op-form [data-div="puerto"].on').count()==1,'apartado nuevo: se elige la división de PERCONSUR (Puerto o Campo)')
    pg.locator('.op-form [data-div="campo"]').click(); pg.fill('.op-form [name=name]','PRUEBA 2027'); submit(pg); pg.wait_for_timeout(400)
    ok(pg.locator('h1.title').inner_text()=='PRUEBA 2027' and pg.locator('.tf-div').inner_text().strip().upper()=='DIVISIÓN CAMPO' and pg.locator('.empty',has_text='Sin tarifas en este apartado').count()==1 and pg.locator('.tf-extras').count()==0,'apartado nuevo «PRUEBA 2027» de División Campo, vacío y sin cargos adicionales')
    pg.locator('[data-more]').click(); pg.wait_for_timeout(300); pg.locator('.as-wrap button',has_text='Cambiar nombre').click(); form(pg)
    pg.fill('.op-form [name=name]','PRUEBA 2028'); submit(pg)
    ok(pg.locator('h1.title').inner_text()=='PRUEBA 2028','cambiar nombre del apartado')
    pg.locator('[data-more]').click(); pg.wait_for_timeout(300); pg.locator('.as-wrap button',has_text='Eliminar apartado').click(); pg.wait_for_timeout(300)
    pg.locator('.as-wrap button',has_text='Eliminar apartado').last.click(); pg.wait_for_timeout(600)
    ok('/tarifas' in pg.url and pg.locator('a.mod-card').count()==1 and 'BAYER INBOUND 2026' in pg.locator('a.mod-card').inner_text(),'eliminar apartado: queda solo BAYER INBOUND 2026')
    # División Puerto: origen Manzanillo, ciudad destino, un monto y cargos adicionales
    pg.locator('[data-add]').first.click(); form(pg); pg.fill('.op-form [name=name]','PUERTO 2027'); submit(pg); pg.wait_for_selector('.tf-extras'); pg.wait_for_timeout(300)
    xt=pg.locator('.tf-extras').inner_text()
    ok(pg.locator('.tf-div').inner_text().strip().upper()=='DIVISIÓN PUERTO' and 'Manzanillo' in pg.locator('.page-lead').inner_text() and 'antes de impuestos' in pg.locator('.page-lead').inner_text(),'apartado «PUERTO 2027» de División Puerto: origen Manzanillo, importes antes de impuestos')
    ok(all(x in xt for x in ['Sobrepeso','$3,000.00','Arrastre local de vacíos en Manzanillo','$2,000.00','Arrastre local de llenos en Manzanillo','$5,000.00']),'cargos adicionales: sobrepeso $3,000, arrastre local de vacíos $2,000 y de llenos $5,000')
    pg.locator('.tf-acts [data-add]').click(); form(pg)
    flds=[t.strip() for t in pg.locator('.op-form .fl').all_inner_texts()]
    ok(pg.locator('.op-form [name=origin]').input_value()=='Manzanillo' and 'Ciudad destino' in flds and 'Planta destino' not in flds and pg.locator('.op-form [name=Tolva], .op-form [name=Jaula]').count()==0 and 'antes de impuestos' in pg.locator('.op-form').inner_text(),'tarifa de Puerto: origen Manzanillo de forma predeterminada, «Ciudad destino» (sin planta) y un solo monto')
    pg.fill('.op-form [name=zone]','Occidente'); pg.fill('.op-form [name=dest]','Guadalajara'); submit(pg)
    ok(errors(pg)==['Captura el monto de la tarifa.'],'Puerto: pide el monto de la tarifa')
    pg.fill('.op-form [name=Sencillo]','28500'); submit(pg)
    pg.locator('.tf-acts [data-add]').click(); form(pg); pg.fill('.op-form [name=zone]','Occidente'); pg.fill('.op-form [name=dest]','guadalajara'); pg.fill('.op-form [name=Sencillo]','1'); submit(pg)
    ok(errors(pg)==['Ya existe la ruta Manzanillo → Guadalajara en este apartado.'],'Puerto: no se repite la ciudad destino')
    pg.fill('.op-form [name=dest]','Colima'); pg.fill('.op-form [name=Sencillo]','9800'); submit(pg)
    t=card(pg,'Manzanillo').inner_text()
    ok(card(pg,'Manzanillo').count()==1 and pg.locator('.tf-o').count()==1 and 'ciudad destino' in t.lower() and 'Colima' in t and '$9,800.00' in t and 'Guadalajara' in t and '$28,500.00' in t and re.search(r'Destinos\s*2',pg.locator('[data-tiles]').inner_text()),'rutas de Puerto: Manzanillo → Colima $9,800 y Guadalajara $28,500')
    pg.fill('[data-text]','colima'); pg.wait_for_timeout(300)
    ok(pg.locator('.tf-t tbody tr[data-route]').count()==1 and '1 ruta encontrada' in pg.locator('.tf-count').inner_text(),'buscar por ciudad destino')
    pg.fill('[data-text]',''); pg.wait_for_timeout(300)
    pg.locator('tr[data-extra]',has_text='Sobrepeso').click(); form(pg)
    ok(pg.locator('.op-form [name=label]').input_value()=='Sobrepeso' and pg.locator('.op-form [name=amount]').input_value()=='3000.00','editar cargo: trae concepto e importe')
    pg.fill('.op-form [name=amount]','3500'); submit(pg)
    pg.locator('[data-xadd]').click(); form(pg); pg.fill('.op-form [name=label]','sobrepeso'); pg.fill('.op-form [name=amount]','100'); submit(pg)
    ok(errors(pg)==['Ya existe el cargo «Sobrepeso».'],'no se repite un cargo adicional')
    pg.fill('.op-form [name=label]','Maniobra en patio'); submit(pg)
    pg.locator('tr[data-extra]',has_text='Arrastre local de llenos').click(); form(pg); pg.locator('.op-form [data-del]').click(); pg.wait_for_timeout(400)
    pg.locator('.as-wrap button',has_text='Eliminar').last.click(); pg.wait_for_timeout(600)
    xt=pg.locator('.tf-extras').inner_text()
    ok('$3,500.00' in xt and 'Maniobra en patio' in xt and '$100.00' in xt and 'llenos' not in xt,'cargos: sobrepeso a $3,500, «Maniobra en patio» agregado y uno eliminado')
    pg.screenshot(path='shots/tf6_puerto.png')
    pg.reload(); pg.wait_for_selector('.tf-extras'); pg.wait_for_timeout(400)
    ok('$3,500.00' in pg.locator('.tf-extras').inner_text() and '$9,800.00' in card(pg,'Manzanillo').inner_text(),'los cambios de Puerto persisten al recargar')
    pg.locator('[data-pdf]').click(); pg.wait_for_selector('.eo-page',timeout=20000); pg.wait_for_timeout(600)
    ok('División Puerto' in pg.locator('[data-note]').inner_text() and 'antes de impuestos' in pg.locator('[data-note]').inner_text(),'PDF de Puerto: el contenido indica la división y que es antes de impuestos')
    pg.locator('[data-act="generate"]').click(); pg.wait_for_selector('.stmt-ok',timeout=20000); pg.wait_for_timeout(300)
    with pg.expect_download() as d: pg.locator('[data-act="save"]').click()
    txt=subprocess.run(['pdftotext','-layout',d.value.path(),'-'],capture_output=True,text=True).stdout
    ok(all(x in txt for x in ['PUERTO 2027','DIVISIÓN PUERTO','CIUDAD DESTINO','Manzanillo','Colima','$9,800.00','CARGOS ADICIONALES','Sobrepeso','$3,500.00','Arrastre local de vacíos en Manzanillo','Las tarifas son antes de impuestos']) and 'PLANTA DESTINO' not in txt and 'TOLVA' not in txt,'PDF de Puerto: ciudad destino, cargos adicionales y nota de antes de impuestos (sin planta ni Tolva)')
    pg.goto(BASE+'#/tarifas'); pg.wait_for_timeout(500)
    ok(pg.locator('a.mod-card').count()==2 and 'División Puerto' in pg.locator('a.mod-card',has_text='PUERTO 2027').inner_text() and '3 cargos adicionales' in pg.locator('a.mod-card',has_text='PUERTO 2027').inner_text(),'Tarifas: PUERTO 2027 aparece como División Puerto con sus cargos')
    # Dirección anterior y menú lateral de computadora
    pg.goto(BASE+'#/tarifario'); pg.wait_for_timeout(500)
    ok(pg.locator('a.mod-card',has_text='BAYER INBOUND 2026').count()==1,'la dirección anterior #/tarifario abre Tarifas')
    pg.set_viewport_size({'width':1440,'height':900}); pg.goto(BASE+'#/tarifas/'+sid); pg.wait_for_selector('.tf-card'); pg.wait_for_timeout(400)
    ok(pg.locator('.tb-sub a.on[href="#/tarifas"]').count()==1,'menú lateral: Administración → Tarifas marcado dentro del apartado')
    pg.screenshot(path='shots/tf5_escritorio.png')
    b.close()
finally: srv.terminate()
print('\n'.join(log)); print('errores:','; '.join(errs) or 'ninguno')
