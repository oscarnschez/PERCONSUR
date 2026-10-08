"""Destino en el mapa (fase 2 del GPS): dirección de entrega de la nota, terminal portuaria en exportación, patio del
control de vacíos, ciudad aproximada, ajuste a mano y catálogo de terminales con dirección. Usa un intermediario GPS y un
buscador de direcciones simulados. PCS_TEST_USER/PCS_TEST_PASS"""
import subprocess, time, sys, os, json, base64, urllib.parse
from playwright.sync_api import sync_playwright
APP=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); SH='shots'; os.makedirs(SH,exist_ok=True)
U=os.environ['PCS_TEST_USER']; P=os.environ['PCS_TEST_PASS']
BASE='http://127.0.0.1:8780/index.html'; W='https://gps.test'
srv=subprocess.Popen([sys.executable,'-m','http.server','8780','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]; log=[]
def ok(c,m): log.append(('OK  ' if c else 'FAIL')+' '+m)
def shot(pg,n): pg.screenshot(path=f'{SH}/ds_{n}.png')
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
U12=(19.010070,-103.832489)
def gps(route, req):
    cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'X-PCS-Key','Content-Type':'application/json'}
    if req.method=='OPTIONS': return route.fulfill(status=204, headers=cors)
    now=int(time.time()*1000)
    dev={'imei':'865190071363660','name':'U12 60-BN-4J','lat':U12[0],'lng':U12[1],'gpsTime':now-20000,'signalTime':now-5000,'speed':70,'course':90,'acc':True,'address':'Autopista Colima - Guadalajara'}
    if '/v1/posiciones' in req.url: return route.fulfill(status=200, headers=cors, body=json.dumps({'ok':True,'fetchedAt':now,'devices':[dev]}))
    if '/v1/ubicacion' in req.url: return route.fulfill(status=200, headers=cors, body=json.dumps({'ok':True,'fetchedAt':now,'device':dev}))
    route.fulfill(status=404, headers=cors, body='{}')
nom={'calls':[]}
def nominatim(route, req):
    qs=urllib.parse.parse_qs(urllib.parse.urlparse(req.url).query); q=(qs.get('q') or qs.get('postalcode') or [''])[0]
    nom['calls'].append(q)
    h={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'}
    if 'Cerenero' in q: body=[{'lat':'20.7471','lon':'-103.4561','place_rank':30,'display_name':'Paseo del Cerenero 890, Nextipac, Zapopan'}]
    elif q.startswith('Guadalajara'): body=[{'lat':'20.6597','lon':'-103.3496','place_rank':16,'display_name':'Guadalajara, Jalisco'}]
    else: body=[]
    route.fulfill(status=200, headers=h, body=json.dumps(body))
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,service_workers='block')
    ctx.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    ctx.route(W+'/**', gps); ctx.route('https://nominatim.openstreetmap.org/**', nominatim)
    ctx.route('https://tile.openstreetmap.org/**', lambda r: r.fulfill(status=200, body=PNG, headers={'Content-Type':'image/png','Access-Control-Allow-Origin':'*'}))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
    pg.goto(BASE); pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login',state='detached'); pg.wait_for_timeout(900)
    if pg.locator('.asheet').count(): pg.get_by_role('button',name='Ahora no').click()
    vid=pg.evaluate("""async()=>{const g=await import('./src/services/gps.js'); await g.saveConfig({url:'https://gps.test',key:'k'});
      const c=await import('./src/services/catalogs.js'); const v=c.listAll('vehicles').find(x=>String(x.eco).replace(/^0+/,'')==='12'); await c.save('vehicles',{...v,gpsDeviceId:'865190071363660',gpsProvider:'iopgps'});
      const d=await import('./src/services/documents.js');
      await d.saveDocument({id:'doc_imp',type:'puerto',company:'perconsur',folio:'90-261008-001',fecha:'2026-10-08',createdAt:Date.now(),status:'generado',summary:'',data:{folio:'90-261008-001',modal:'imp',terminal:'SSA',destNombre:'ALMACENES DEL BAJIO',destDir:'Paseo del Cerenero 890, Nextipac, C.P. 45220, Zapopan, Jalisco',conts:[{num:'MSCU1234567'}]}});
      const l=await import('./src/services/logistics.js'); const o=(await import('./src/services/operators.js')).operatorList()[0];
      await l.saveOperation({vehicleId:v.id,operatorId:o.id,trailerId:null,division:'puerto',status:'to_destination',origin:'Manzanillo',destination:'Zapopan, JAL',reference:'MSCU1234567',documentId:'doc_imp'}); return v.id}""")
    pg.goto(BASE+'#/'); pg.wait_for_timeout(2500)
    d=pg.locator('.lgh-card .lgh-dest')
    ok(d.count()==1 and 'de ALMACENES DEL BAJIO' in d.inner_text() and ' km' in d.inner_text(),'Inicio: distancia al destino de la nota: '+(d.inner_text() if d.count() else '—'))
    ok(pg.locator('.lgh-card .gps-tgt').count()==1 and pg.locator('.lgh-card .gps-line').count()==1,'Inicio: destino marcado en el mapa de la ficha con línea desde la unidad')
    n1=len(nom['calls']); ok(n1==1 and 'Cerenero' in nom['calls'][0],'se buscó la dirección de entrega de la nota una sola vez: '+str(nom['calls']))
    pg.locator('[data-lghome]').scroll_into_view_if_needed(); pg.evaluate('window.scrollBy(0,300)'); shot(pg,'d01_inicio')
    pg.locator('.lgh-card').first.click(); pg.wait_for_timeout(1800)
    dd=pg.locator('.gps-dest'); t=dd.inner_text() if dd.count() else ''
    ok('Destino · Nota 90-261008-001' in t and 'ALMACENES DEL BAJIO' in t and 'Paseo del Cerenero' in t and 'Ubicación según la dirección' in t and 'en línea recta' in t,'detalle: destino de la nota con dirección, precisión y distancia: '+t.replace('\n',' | '))
    ok(pg.locator('.gps .gps-tgt').count()==1 and pg.locator('.gps .gps-line').count()==1,'detalle: destino en el mapa con línea punteada')
    href=pg.locator('.gps-acts a:has-text("Cómo llegar")').get_attribute('href') or ''
    ok('origin=19.01007,-103.832489' in href and 'destination=20.7471,-103.4561' in href,'«Cómo llegar» de la unidad al destino: '+href)
    pg.wait_for_timeout(1500)
    info=pg.evaluate('''()=>{const m=document.querySelector('.gps-map'), r=m.getBoundingClientRect(); const box=(s)=>{const e=document.querySelector('.gps-map '+s); if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.left-r.left),Math.round(b.top-r.top),Math.round(b.width),Math.round(b.height)]}; return {map:[r.width,r.height], unit:box('.gps-pin'), tgt:box('.gps-tgt')}}''')
    ok(info['unit'] and info['tgt'] and all(0<=v[0]<=info['map'][0] and 0<=v[1]<=info['map'][1] for v in [info['unit'],info['tgt']]),'detalle: la unidad y el destino quedan dentro del mapa')
    pg.locator('.gps').scroll_into_view_if_needed(); shot(pg,'d02_detalle')
    pg.goto(BASE+'#/'); pg.wait_for_timeout(1200); ok(len(nom['calls'])==n1,'al volver no se repite la búsqueda (queda guardada)')
    pg.goto(BASE+'#/operacion/logistica/u/'+vid); pg.wait_for_timeout(1500)
    # ajustar destino a mano
    pg.locator('[data-g-adjust]').click(); pg.wait_for_selector('.pp-sheet .leaflet-container'); pg.wait_for_timeout(600)
    shot(pg,'d03_picker')
    pg.fill('.pp-find input','20.7480, -103.4570'); pg.press('.pp-find input','Enter'); pg.wait_for_timeout(600)
    pg.locator('.pp [data-ok]').click(); pg.wait_for_timeout(900)
    t=pg.locator('.gps-dest').inner_text()
    ok('Ubicación fijada en el mapa' in t,'ajustar destino: punto fijado a mano: '+t.replace('\n',' | '))
    g=pg.evaluate("async()=>{const db=await import('./src/services/db.js'); return (await db.all('geocodes')).find(x=>x.precision==='manual')}")
    ok(g and abs(g['lat']-20.748)<1e-4 and abs(g['lng']+103.457)<1e-4 and 'Cerenero' in g['address'],'el punto fijado se guarda para esa dirección')
    # exportación: terminal sin dirección
    pg.evaluate("""async(vid)=>{const d=await import('./src/services/documents.js');
      await d.saveDocument({id:'doc_exp',type:'puerto',company:'perconsur',folio:'90-261008-002',fecha:'2026-10-08',createdAt:Date.now(),status:'generado',summary:'',data:{folio:'90-261008-002',modal:'exp',terminal:'SSA',destNombre:'',destDir:'',conts:[{num:'MSCU7654321'}]}});
      const l=await import('./src/services/logistics.js'); const op=l.openOf(vid); await l.saveOperation({id:op.id,vehicleId:vid,status:'to_destination',documentId:'doc_exp'})}""", vid)
    pg.wait_for_timeout(1200)
    t=pg.locator('.gps-dest').inner_text()
    ok('Terminal · Nota 90-261008-002' in t and 'SSA' in t and 'Sin dirección' in t and 'Terminales portuarias' in t,'exportación: la terminal es el destino; sin dirección lo indica: '+t.replace('\n',' | '))
    # catálogo de terminales: dirección y link
    pg.goto(BASE+'#/catalogos/terminals'); pg.wait_for_timeout(600)
    pg.locator('.row:has-text("SSA")').first.click(); pg.wait_for_selector('.cat-form')
    ok(pg.locator('.cat-form [name=address]').count()==1 and pg.locator('.cat-form [name=maps]').count()==1 and pg.locator('.cat-form [data-geo-pick]').count()==1,'terminales portuarias: dirección, link de Google Maps y «Ubicar en el mapa»')
    pg.fill('.cat-form [name=address]','Av. Teniente Azueta s/n, Burócrata, 28250 Manzanillo, Colima')
    pg.fill('.cat-form [name=maps]','https://www.google.com/maps/place/SSA/@19.0581,-104.2962,17z/data=!4m6!3m5!8m2!3d19.0577!4d-104.2955'); pg.locator('.cat-form [name=maps]').dispatch_event('change'); pg.wait_for_timeout(200)
    ok('link de Google Maps' in pg.locator('[data-geo-st]').inner_text(),'el link largo de Google Maps da la ubicación: '+pg.locator('[data-geo-st]').inner_text())
    shot(pg,'d04_terminal'); pg.locator('.cat-form button[type=submit]').click(); pg.wait_for_timeout(500)
    ok('Av. Teniente Azueta' in pg.locator('[data-list]').inner_text(),'la lista de terminales muestra la dirección')
    pg.goto(BASE+'#/operacion/logistica/u/'+vid); pg.wait_for_timeout(1500)
    t=pg.locator('.gps-dest').inner_text()
    ok('SSA' in t and 'Ubicación del link de Google Maps' in t and 'Av. Teniente Azueta' in t,'exportación: terminal ubicada con su link: '+t.replace('\n',' | '))
    href=pg.locator('.gps-acts a:has-text("Cómo llegar")').get_attribute('href') or ''; ok('destination=19.0577,-104.2955' in href,'Cómo llegar a la terminal')
    # en ruta vacío → patio del control de vacíos
    yid=pg.evaluate("""async(vid)=>{const c=await import('./src/services/catalogs.js'); const y=c.list('yards')[0];
      const l=await import('./src/services/logistics.js'); const op=l.openOf(vid);
      const e=await import('./src/services/empties.js'); await e.create({containerNumber:'MSCU7654321',vehicleId:vid,logisticsOperationId:op.id,yardId:y.id});
      await l.saveOperation({id:op.id,vehicleId:vid,status:'empty_transit'}); return y.id}""", vid)
    pg.wait_for_timeout(1200)
    t=pg.locator('.gps-dest').inner_text()
    ok('Patio de entrega · Control de vacíos · MSCU7654321' in t and 'Sin dirección' in t and 'Patios de vacíos' in t,'en ruta vacío: el destino es el patio del control de vacíos: '+t.replace('\n',' | '))
    ok(pg.locator('[data-g-adjust]').count()==1 and 'Ubicar destino' in pg.locator('[data-g-adjust]').inner_text(),'«Ubicar destino» para el patio sin dirección')
    pg.locator('[data-g-adjust]').click(); pg.wait_for_selector('.pp-sheet .leaflet-container'); pg.wait_for_timeout(500)
    pg.fill('.pp-find input','19.1031, -104.3333'); pg.press('.pp-find input','Enter'); pg.wait_for_timeout(500); pg.locator('.pp [data-ok]').click(); pg.wait_for_timeout(900)
    t=pg.locator('.gps-dest').inner_text(); ok('Ubicación fijada en el mapa' in t,'patio ubicado en el mapa desde Logística: '+t.replace('\n',' | '))
    pin=pg.evaluate("async(yid)=>{const c=await import('./src/services/catalogs.js'); return c.listAll('yards').find(x=>x.id===yid).pin}", yid)
    ok(pin and abs(pin['lat']-19.1031)<1e-4,'el punto queda en el catálogo de patios')
    pg.locator('.gps').scroll_into_view_if_needed(); shot(pg,'d05_patio')
    # sin documento: ciudad aproximada; dirección que no se encuentra
    pg.evaluate("""async(vid)=>{const l=await import('./src/services/logistics.js'); const op=l.openOf(vid); await l.saveOperation({id:op.id,vehicleId:vid,status:'to_destination',documentId:null,destination:'Guadalajara',deliveryPlace:''})}""", vid)
    pg.wait_for_timeout(2500)
    t=pg.locator('.gps-dest').inner_text(); ok('Guadalajara' in t and 'aproximada (municipio)' in t and pg.locator('[data-g-adjust]').count()==0,'sin nota: ciudad destino aproximada (sin ajuste a mano): '+t.replace('\n',' | '))
    pg.evaluate("""async(vid)=>{const d=await import('./src/services/documents.js');
      await d.saveDocument({id:'doc_x',type:'puerto',company:'perconsur',folio:'90-261008-003',fecha:'2026-10-08',createdAt:Date.now(),status:'generado',summary:'',data:{folio:'90-261008-003',modal:'imp',destNombre:'BODEGA X',destDir:'Calle Inexistente 1, Lugar Raro',conts:[]}});
      const l=await import('./src/services/logistics.js'); const op=l.openOf(vid); await l.saveOperation({id:op.id,vehicleId:vid,status:'to_destination',documentId:'doc_x'})}""", vid)
    pg.wait_for_timeout(4500)
    t=pg.locator('.gps-dest').inner_text(); ok('No se encontró la dirección' in t and 'Ubicar destino' in pg.locator('[data-g-adjust]').inner_text(),'dirección que no se encuentra: lo dice y permite ubicarla a mano: '+t.replace('\n',' | '))
    r=pg.evaluate("async()=>{const m=await import('./src/services/backup.js'); const o=JSON.parse(await (await m.exportBackup()).text()); return (o.data.geocodes||[]).filter(g=>g.precision==='manual').length}")
    ok(r==1,'respaldo: incluye los puntos fijados a mano')
    pg.emulate_media(color_scheme='dark'); pg.evaluate("""async(vid)=>{const l=await import('./src/services/logistics.js'); const op=l.openOf(vid); await l.saveOperation({id:op.id,vehicleId:vid,status:'to_destination',documentId:'doc_imp'})}""", vid)
    pg.goto(BASE+'#/'); pg.wait_for_timeout(1800); pg.locator('[data-lghome]').scroll_into_view_if_needed(); pg.evaluate('window.scrollBy(0,300)'); shot(pg,'d06_dark')
    b.close()
finally:
  srv.terminate()
print('\n'.join(log)); print('ERRORES:',errs)
