"""Tarifario (Administración): tarjeta en el módulo, zonas, búsqueda por origen y destino, filtro por zona y escritorio."""
import subprocess, time, sys, os
from playwright.sync_api import sync_playwright
APP=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); os.makedirs('shots',exist_ok=True)
U=os.environ['PCS_TEST_USER']; P=os.environ['PCS_TEST_PASS']; BASE='http://127.0.0.1:8776/index.html'
srv=subprocess.Popen([sys.executable,'-m','http.server','8776','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
log=[]; errs=[]
def ok(c,m): log.append(('OK  ' if c else 'FAIL')+' '+m)
def cards(pg): return pg.locator('.tf-card').count()
def origins(pg): return [t.strip() for t in pg.locator('.tf-o').all_inner_texts()]
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,service_workers='block')
    ctx.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login',state='detached'); pg.wait_for_timeout(900)
    if pg.locator('.asheet').count(): pg.get_by_role('button',name='Ahora no').click()
    # Administración → Tarifario
    pg.goto(BASE+'#/administracion'); pg.wait_for_timeout(700)
    card=pg.locator('a.mod-card[href="#/tarifario"]')
    ok(card.count()==1 and '85 rutas' in card.inner_text() and '6 zonas' in card.inner_text(),'Administración: tarjeta Tarifario con 85 rutas y 6 zonas')
    card.click(); pg.wait_for_selector('.tf-card'); pg.wait_for_timeout(400)
    ok('/tarifario' in pg.url and 'sencillo' in pg.locator('.page-lead').inner_text(),'abre el Tarifario (configuración de transporte sencillo)')
    zs=[t.strip() for t in pg.locator('.tf-zone .sec-h').all_inner_texts()]
    ok(zs==['Occidente','Pacífico','Bajío zona A','Bajío zona B','Bajío zona C','Bajío zona D'] and cards(pg)==41,'organizado por zonas: 6 zonas y 41 ciudades de origen')
    t=pg.locator('.tf-card',has_text='Sayula').inner_text()
    ok('Nextipac' in t and '$21,200.00' in t and '$17,200.00' in t and 'Mochis' not in t,'Sayula: Nextipac Tolva $21,200 y Jaula $17,200; sin Los Mochis (sin monto en la hoja)')
    ok(pg.locator('text=Torton').count()==0 and pg.locator('text=Full').count()==0,'no aparecen Torton ni unidades full')
    pg.screenshot(path='shots/tf1_tarifario.png')
    # Búsqueda por origen (sin acentos ni espacios)
    pg.fill('[data-origin]','penjamo'); pg.wait_for_timeout(300)
    ok(origins(pg)==['Pénjamo'] and '2 rutas encontradas' in pg.locator('.tf-count').inner_text(),'buscar «penjamo» encuentra Pénjamo (2 rutas)')
    pg.fill('[data-origin]','sanjuan'); pg.wait_for_timeout(300)
    ok(origins(pg)==['San Juan de Abajo, Nay.'],'buscar «sanjuan» encuentra San Juan de Abajo, Nay.')
    pg.screenshot(path='shots/tf2_busqueda.png')
    # Destino
    pg.fill('[data-origin]',''); pg.locator('[data-dest="Planta Los Mochis"]').click(); pg.wait_for_timeout(300)
    ok(cards(pg)==3 and pg.locator('.tf-t tbody tr').count()==3 and all('Los Mochis' in x for x in pg.locator('.tf-t tbody tr').all_inner_texts()),'destino Los Mochis: 3 rutas, solo filas de esa planta')
    ok(pg.locator('[data-dest="Planta Los Mochis"]').get_attribute('aria-pressed')=='true','la planta elegida queda marcada')
    # Origen + destino
    pg.locator('[data-dest="Planta Nextipac"]').click(); pg.fill('[data-origin]','leon'); pg.wait_for_timeout(300)
    ok(origins(pg)==['León'] and pg.locator('.tf-t tbody tr').count()==1,'origen «leon» hacia Nextipac: una ruta')
    # Zona
    pg.fill('[data-origin]',''); pg.locator('[data-dest=""]').click(); pg.locator('[data-zone="Bajío zona A"]').click(); pg.wait_for_timeout(300)
    zs=[t.strip() for t in pg.locator('.tf-zone .sec-h').all_inner_texts()]
    ok(zs==['Bajío zona A'] and cards(pg)==9,'filtro por zona: Bajío zona A con 9 orígenes')
    # Sin resultados y quitar filtros
    pg.fill('[data-origin]','zzz'); pg.wait_for_timeout(300)
    ok(pg.locator('.empty',has_text='Sin tarifas').count()==1,'sin coincidencias: aviso «Sin tarifas»')
    pg.locator('[data-clear]').click(); pg.wait_for_timeout(300)
    ok(cards(pg)==41 and pg.locator('[data-origin]').input_value()=='','«Quitar filtros» vuelve a mostrar todo')
    pg.screenshot(path='shots/tf3_sin_filtros.png')
    # Computadora: acceso en el menú lateral y tarjetas en columnas
    pg.set_viewport_size({'width':1440,'height':900}); pg.wait_for_timeout(400)
    pg.goto(BASE+'#/administracion'); pg.wait_for_timeout(500)
    side=pg.locator('.tb-sub a[href="#/tarifario"]')
    ok(side.count()==1,'menú lateral: Administración → Tarifario')
    b.close()
finally: srv.terminate()
print('\n'.join(log)); print('errores:','; '.join(errs) or 'ninguno')
