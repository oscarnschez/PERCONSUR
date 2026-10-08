"""Control de vacíos: creación automática desde Logística, sin duplicados, programación, otro transportista, vencidas, en traslado,
entregado, movimientos, filtros, buscador, código para Excel (Scan-IT to Office), persistencia y respaldo. PCS_TEST_USER/PCS_TEST_PASS"""
import subprocess, time, sys, os, json, datetime
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); APP=os.path.abspath(os.path.join(HERE,'..')); SH='shots'; os.makedirs(SH,exist_ok=True)
U=os.environ['PCS_TEST_USER']; P=os.environ['PCS_TEST_PASS']; BASE='http://127.0.0.1:8778/index.html'
srv=subprocess.Popen([sys.executable,'-m','http.server','8778','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]; log=[]
def ok(c,m): log.append(('OK  ' if c else 'FAIL')+' '+m)
def shot(pg,n): pg.screenshot(path=f'{SH}/ev_{n}.png')
def toast(pg): return pg.locator('.toast-host').inner_text() if pg.locator('.toast-host').count() else ''
def login(pg):
    pg.goto(BASE); pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login',state='detached'); pg.wait_for_timeout(900)
    if pg.locator('.asheet').count(): pg.get_by_role('button',name='Ahora no').click()
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,service_workers='block',accept_downloads=True)
    ctx.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
    login(pg)
    # catálogo de patios sembrado
    pg.goto(BASE+'#/catalogos/yards'); pg.wait_for_timeout(600)
    ys=[x.inner_text() for x in pg.locator('[data-id] b').all()]
    ok(len(ys)==12 and ys[0]=='CIMA ASIPONA' and ys[-1]=='EXPRESS PORT','catálogo Patios de vacíos con los 12 patios del Excel'); shot(pg,'e01_patios')
    info=pg.evaluate("""async()=>{const o=await import('./src/services/operators.js'); const ops=o.operatorList(); const op=ops.find(x=>/Rogelio/.test(x.name))||ops[0]; const op2=ops.find(x=>x.id!==op.id);
      const t=await o.saveTrip({operatorId:op.id,division:'puerto',date:'2026-10-05',reference:'ONEU2824839',origin:'Manzanillo',destination:'Guadalajara',fare:1500000,travelExpenses:0,commissionRate:15});
      const l=await import('./src/services/logistics.js'); const c=await import('./src/services/catalogs.js'); const u=l.units()[0]; const tr=c.listAll('trailers')[0];
      const opn=await l.saveOperation({vehicleId:u.id,operatorId:op.id,trailerId:tr.id,division:'puerto',status:'to_destination',origin:'Manzanillo',destination:'Guadalajara',reference:'ONEU2824839',deliveryPlace:'Grupo X',tripId:t.id,documentId:null});
      return {op:op.name, op2:op2.name, vid:u.id, unit:u.label, opn:opn.id}}""")
    # cambiar a Vacío desde la hoja de estado
    pg.goto(BASE+'#/operacion/logistica/u/'+info['vid']); pg.wait_for_timeout(600)
    pg.locator('[data-status]').click(); pg.wait_for_selector('.lg-stlist'); pg.locator('[data-set="empty"]').click(); pg.wait_for_timeout(700)
    ok('Control de vacío creado: ONEU2824839' in toast(pg),'al pasar a Vacío se crea el control automáticamente: '+toast(pg))
    lk=pg.locator('.ec-link'); ok(lk.count()==1 and 'ONEU2824839' in lk.inner_text(),'detalle logístico: «Ver control de vacío»'); shot(pg,'e02_unidad')
    # volver a marcar: no duplica
    pg.evaluate("""async(id)=>{const l=await import('./src/services/logistics.js'); await l.setStatus(id,'to_destination'); await l.setStatus(id,'empty');}""", info['opn'])
    n=pg.evaluate("async()=>(await import('./src/services/empties.js')).all().length"); ok(n==1,'mismo contenedor de nuevo en Vacío: no se duplica')
    pg.goto(BASE+'#/operacion/logistica'); pg.wait_for_timeout(600)
    ok('Vacíos pendientes: 1' in pg.locator('.ec-entry').inner_text(),'indicador «Vacíos pendientes» en Logística'); shot(pg,'e03_logistica')
    pg.locator('.ec-entry').click(); pg.wait_for_timeout(600)
    ok('vacios' in pg.url and pg.locator('.ec-card').count()==1,'el indicador abre Control de vacíos')
    card=pg.locator('.ec-card').first.inner_text()
    ok('ONEU2824839' in card and 'Pendiente de asignar' in card and info['op'] in card,'tarjeta: contenedor, estado y operador sugerido (del viaje)')
    pg.locator('.ec-card').first.click(); pg.wait_for_timeout(600); shot(pg,'e04_detalle')
    det=pg.locator('.page').inner_text()
    ok(info['unit'] in det and 'Manzanillo' in det and 'División Puerto' in det and 'Quedó vacío' in det,'origen: unidad, viaje, división y fecha en que quedó vacío')
    # código sin datos completos → falta patio/fecha/hora
    pg.locator('[data-a="code"]').first.click(); pg.wait_for_timeout(500)
    miss=pg.locator('.ec-miss').inner_text()
    ok('Falta seleccionar el patio de entrega.' in miss and 'Falta la fecha de entrega.' in miss and 'Falta la hora de entrega.' in miss,'validación antes de generar el código: '+miss.replace('\n',' | '))
    pg.locator('[data-fix]').click(); pg.wait_for_selector('.ec-form')
    pg.locator('[data-pk="yard"]').click(); pg.wait_for_selector('.picker'); pg.locator('.picker .pk-row',has_text='SSA EXTERNO').click(); pg.wait_for_timeout(300)
    today=datetime.date.today().isoformat(); yday=(datetime.date.today()-datetime.timedelta(days=1)).isoformat()
    pg.fill('.ec-form [name=date]',today); pg.fill('.ec-form [name=time]','07:00'); shot(pg,'e05_form')
    pg.locator('.ec-form button[type=submit]').click(); pg.wait_for_timeout(600)
    ok('Programado' in pg.locator('.ec-hero').inner_text(),'con operador, patio y fecha pasa a Programado')
    # código
    pg.locator('[data-a="code"]').first.click(); pg.wait_for_selector('.ec-code img',timeout=10000); pg.wait_for_timeout(500)
    cols=[x.inner_text() for x in pg.locator('.ec-cols dd').all()]
    d=datetime.date.today().strftime('%d/%m/%Y')
    exp=['ONEU2824839',info['op'].replace('í','i').replace('é','e').replace('á','a').replace('ó','o').replace('ú','u').replace('ñ','n'),'No','(vacío)','SSA EXTERNO',d,'07:00','No','(vacío)']
    ok(cols==exp,'contenido del código en el orden del Excel: '+' | '.join(cols))
    kind=pg.locator('.ec-code img').get_attribute('class'); ok(kind=='xl-pdf','código PDF417 (mismo formato que el Código para Excel actual)')
    ok(pg.locator('[data-x="save"]:not([disabled])').count()==1,'imagen lista para Compartir / Guardar'); shot(pg,'e06_codigo')
    with pg.expect_download() as dl: pg.locator('[data-x="save"]').click()
    ok(dl.value.suggested_filename.startswith('Vacio-ONEU2824839'),'guardar imagen: '+dl.value.suggested_filename)
    pg.locator('[data-x="close"]').click(); pg.wait_for_timeout(300)
    # cambio de operador → el código se regenera
    pg.locator('[data-a="edit"]').first.click(); pg.wait_for_selector('.ec-form'); pg.locator('[data-pk="operator"]').click(); pg.wait_for_selector('.picker'); pg.locator('.picker .pk-row',has_text=info['op2']).first.click(); pg.wait_for_timeout(200)
    ok('Operador del viaje' in pg.locator('[data-h="operator"]').inner_text(),'el operador que entrega puede ser distinto al del viaje')
    pg.locator('.ec-form button[type=submit]').click(); pg.wait_for_timeout(500)
    pg.locator('[data-a="code"]').first.click(); pg.wait_for_selector('.ec-cols'); c2=pg.locator('.ec-cols dd').nth(1).inner_text(); ok(c2!=cols[1],'el código se regenera con el nuevo operador: '+c2); pg.locator('[data-x="close"]').click(); pg.wait_for_timeout(300)
    # registro manual con transportista externo y fecha vencida
    pg.goto(BASE+'#/operacion/logistica/vacios'); pg.wait_for_timeout(500)
    pg.locator('[data-new]').first.click(); pg.wait_for_selector('.bsheet [name=num]'); pg.fill('.bsheet [name=num]','mieu0056003'); pg.locator('.bsheet button[type=submit]').click(); pg.wait_for_timeout(700)
    ok('vacios/ec_' in pg.url,'registro manual de un vacío')
    pg.locator('[data-a="edit"]').first.click(); pg.wait_for_selector('.ec-form')
    pg.locator('.ec-form [name=ext]').check(); pg.wait_for_timeout(200)
    ok(pg.locator('[data-own]').is_hidden() and pg.locator('[data-ext]').is_visible(),'switch «Se entrega con otro transportista» muestra sus campos')
    pg.fill('.ec-form [name=carrier]','Transportes del Pacífico'); pg.fill('.ec-form [name=driver]','Luis Gómez'); pg.fill('.ec-form [name=xveh]','abc-123')
    pg.locator('[data-pk="yard"]').click(); pg.wait_for_selector('.picker'); pg.fill('.picker .search-in','patio nuevo'); pg.wait_for_timeout(200); pg.locator('.picker [data-new]').first.click(); pg.wait_for_timeout(400)
    pg.fill('.ec-form [name=date]',yday); pg.fill('.ec-form [name=time]','20:00'); pg.locator('.ec-form button[type=submit]').click(); pg.wait_for_timeout(600)
    ok('Entrega vencida' in pg.locator('.ec-hero').inner_text(),'entrega programada en el pasado: «Entrega vencida»')
    pg.locator('[data-a="code"]').first.click(); pg.wait_for_selector('.ec-cols'); cx=[x.inner_text() for x in pg.locator('.ec-cols dd').all()]
    ok(cx[1]=='Luis Gomez' and cx[2]=='Si' and cx[3]=='TRANSPORTES DEL PACIFICO' and cx[4]=='PATIO NUEVO','código con otro transportista: '+' | '.join(cx)); pg.locator('[data-x="close"]').click(); pg.wait_for_timeout(300)
    pg.goto(BASE+'#/operacion/logistica/vacios'); pg.wait_for_timeout(600)
    nums=[x.inner_text() for x in pg.locator('.ec-card .ec-num').all()]; ok(nums==['MIEU0056003','ONEU2824839'],'orden: vencidas primero, luego hoy')
    tiles=[x.inner_text().replace('\n',' ') for x in pg.locator('.ec-tile').all()]; ok(tiles==['Pendientes 0','Programados 2','En traslado 0','Entregados hoy 0'],'indicadores: '+', '.join(tiles))
    shot(pg,'e07_lista')
    # en traslado y entregado
    pg.locator('.ec-card',has_text='ONEU2824839').click(); pg.wait_for_timeout(500)
    pg.locator('[data-a="transit"]').click(); pg.wait_for_timeout(500); ok('En traslado' in pg.locator('.ec-hero').inner_text(),'marcar en traslado')
    pg.locator('[data-a="deliver"]').click(); pg.wait_for_selector('.ec-sum'); shot(pg,'e08_entregar')
    s=pg.locator('.ec-sum').inner_text(); ok('ONEU2824839' in s and 'SSA EXTERNO' in s and info['op2'] in s,'resumen antes de confirmar la entrega')
    pg.fill('.bsheet [name=time]','12:15'); pg.get_by_role('button',name='Confirmar entrega').click(); pg.wait_for_timeout(600)
    ok('Entregado' in pg.locator('.ec-hero').inner_text() and '12:15' in pg.locator('.page').inner_text(),'entregado con hora real corregida')
    pg.locator('[data-a="code"]').first.click(); pg.wait_for_selector('.ec-cols'); cd=[x.inner_text() for x in pg.locator('.ec-cols dd').all()]
    ok(cd[6]=='12:15' and cd[7]=='Si','código del entregado: hora real y ¿ENTREGADO? = Si'); pg.locator('[data-x="close"]').click(); pg.wait_for_timeout(300)
    hist=[x.inner_text() for x in pg.locator('.ec-mv .ec-act').all()]
    ok(all(k in hist for k in ['Creado como vacío','Patio asignado','Entrega programada','Operador asignado','En traslado','Entregado','Vacío detectado de nuevo']),'historial: '+', '.join(hist))
    pg.goto(BASE+'#/operacion/logistica/vacios'); pg.wait_for_timeout(600)
    pend=pg.locator('.ec-cards').first.locator('.ec-num').all_inner_texts(); ok(pend==['MIEU0056003'],'el entregado sale de pendientes')
    ok('Entregados hoy 1' in pg.locator('[data-tiles]').inner_text().replace('\n',' '),'indicador Entregados hoy')
    mv=pg.locator('[data-moves] .ec-mv').first.inner_text(); ok('ONEU2824839' in mv and 'Entregado' in mv and 'SSA EXTERNO' in mv,'movimientos recientes: '+mv.replace('\n',' | '))
    shot(pg,'e09_movs'); pg.evaluate('window.scrollTo(0,99999)'); pg.wait_for_timeout(200); shot(pg,'e09b_movs')
    # filtros y buscador
    pg.locator('[data-st="delivered"]').click(); pg.wait_for_timeout(200); ok(pg.locator('.ec-card').count()==1,'filtro Entregados')
    pg.locator('[data-st="all"]').click(); pg.fill('.ec-page .search-in','pacifico'); pg.wait_for_timeout(200); ok(pg.locator('.ec-card .ec-num').all_inner_texts()==['MIEU0056003'],'buscar por transportista')
    pg.fill('.ec-page .search-in','ssa'); pg.wait_for_timeout(200); ok(pg.locator('.ec-card .ec-num').all_inner_texts()==['ONEU2824839'],'buscar por patio')
    pg.fill('.ec-page .search-in',info['unit']); pg.wait_for_timeout(200); ok('ONEU2824839' in pg.locator('[data-list]').inner_text(),'buscar por unidad')
    pg.fill('.ec-page .search-in',''); pg.locator('[data-f="carrier"]').click(); pg.wait_for_selector('.picker'); pg.locator('.picker .pk-row').first.click(); pg.wait_for_timeout(300)
    ok(pg.locator('.ec-card .ec-num').all_inner_texts()==['MIEU0056003'],'filtro por transportista'); pg.locator('[data-f="carrier"]').click(); pg.wait_for_timeout(200)
    pg.locator('[data-f="date"]').click(); pg.get_by_role('button',name='Vencidas').click(); pg.wait_for_timeout(300); ok(pg.locator('.ec-card .ec-num').all_inner_texts()==['MIEU0056003'],'filtro por fecha: vencidas')
    # persistencia
    pg.reload(); pg.wait_for_timeout(1200); pg.goto(BASE+'#/operacion/logistica/vacios'); pg.wait_for_timeout(600)
    ok(pg.locator('.ec-card').count()==2,'persiste tras recargar')
    # respaldo e importación en otro dispositivo
    full=pg.evaluate("async()=>{const m=await import('./src/services/backup.js'); return await (await m.exportBackup({includeMedia:false})).text()}")
    o=json.loads(full); ok(len(o['data']['emptyContainers'])==2 and len(o['data']['emptyContainerEvents'])>=8 and len(o['data']['yards'])==13,'respaldo incluye vacíos, movimientos y patios')
    ctx2=b.new_context(viewport={'width':390,'height':844},is_mobile=True,service_workers='block'); ctx2.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    p2=ctx2.new_page(); p2.on('pageerror',lambda e:errs.append('p2 '+str(e)))
    login(p2)
    r=p2.evaluate("""async(j)=>{const m=await import('./src/services/backup.js'); await m.importBackup(await m.inspectBackup(new File([j],'r.json')));
      const e=await import('./src/services/empties.js'); const c=await import('./src/services/catalogs.js');
      const ys=c.listAll('yards'); const recs=e.all(); return {yards:ys.length, ok:recs.every(x=>!x.yardId||ys.some(y=>y.id===x.yardId)), names:recs.map(x=>e.view(x).yard).sort(), op:recs.map(x=>e.view(x).deliveryOperator||e.view(x).deliverer)}}""", full)
    ok(r['yards']==13 and r['ok'] and r['names']==['PATIO NUEVO','SSA EXTERNO'],'importación: patios sin duplicar y relaciones conservadas: '+json.dumps(r))
    pg.emulate_media(color_scheme='dark'); pg.goto(BASE+'#/operacion/logistica/vacios'); pg.wait_for_timeout(500); shot(pg,'e10_dark')
    b.close()
finally:
  srv.terminate()
print('\n'.join(log)); print('ERRORES:',errs)
