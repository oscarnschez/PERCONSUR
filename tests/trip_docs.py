"""Documentos adicionales de viajes y expediente consolidado: varios archivos a la vez, orden, renombrar, eliminar, archivo dañado,
vista previa, PDF consolidado (páginas copiadas, imágenes centradas), original intacto, persistencia y respaldo. PCS_TEST_USER/PCS_TEST_PASS"""
import subprocess, time, sys, os, json, base64, tempfile, shutil, zlib, re
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); APP=os.path.abspath(os.path.join(HERE,'..')); SH='shots'; os.makedirs(SH,exist_ok=True)
U=os.environ['PCS_TEST_USER']; P=os.environ['PCS_TEST_PASS']; BASE='http://127.0.0.1:8776/index.html'
FD=tempfile.mkdtemp()
def pdf(path, n, label):
    """PDF mínimo de n páginas con texto (sin dependencias)"""
    out=[b'%PDF-1.4\n']; offs=[]; nobj=3+n*2
    def add(s): offs.append(sum(len(x) for x in out)); out.append(s)
    add(b'1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n')
    add(('2 0 obj<</Type/Pages/Kids[%s]/Count %d>>endobj\n' % (' '.join('%d 0 R' % (3+i*2) for i in range(n)), n)).encode())
    for i in range(n):
        st=('BT /F1 28 Tf 72 700 Td (%s pagina %d) Tj ET' % (label, i+1)).encode()
        add(('%d 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents %d 0 R/Resources<</Font<</F1 %d 0 R>>>>>>endobj\n' % (3+i*2, 4+i*2, nobj)).encode())
        add(('%d 0 obj<</Length %d>>stream\n' % (4+i*2, len(st))).encode()+st+b'\nendstream endobj\n')
    add(('%d 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' % nobj).encode())
    x=sum(len(s) for s in out)
    out.append(('xref\n0 %d\n0000000000 65535 f \n' % (nobj+1)).encode()+''.join('%010d 00000 n \n' % o for o in offs).encode()+('trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF' % (nobj+1, x)).encode())
    open(path,'wb').write(b''.join(out))
pdf(os.path.join(FD,'Carta-Porte.pdf'),3,'Carta Porte'); pdf(os.path.join(FD,'original.pdf'),2,'Nota original')
shutil.copy(os.path.join(HERE,'foto.jpg'),os.path.join(FD,'Ticket combustible.jpg')); shutil.copy(os.path.join(HERE,'anexo.png'),os.path.join(FD,'Evidencia entrega.png')); shutil.copy(os.path.join(HERE,'anexo.pdf'),os.path.join(FD,'Acuse.pdf'))
open(os.path.join(FD,'Dañado.pdf'),'wb').write(b'%PDF-1.4\nesto no es un pdf valido'+os.urandom(200)); open(os.path.join(FD,'notas.txt'),'w').write('hola')
srv=subprocess.Popen([sys.executable,'-m','http.server','8776','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]; log=[]
def ok(c,m): log.append(('OK  ' if c else 'FAIL')+' '+m)
def shot(pg,n): pg.screenshot(path=f'{SH}/td_{n}.png')
def login(pg):
    pg.goto(BASE); pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login',state='detached'); pg.wait_for_timeout(900)
    if pg.locator('.asheet').count(): pg.get_by_role('button',name='Ahora no').click()
ORIG=base64.b64encode(open(os.path.join(FD,'original.pdf'),'rb').read()).decode()
def open_trip(pg, opid, tid):
    pg.goto(BASE+'#/operadores/'+opid); pg.wait_for_timeout(700)
    if pg.locator('[data-tab="viajes"]').count(): pg.locator('[data-tab="viajes"]').click(); pg.wait_for_timeout(300)
    pg.locator(f'[data-trip="{tid}"]').first.click(); pg.wait_for_selector('[data-tripdocs] .td-add'); pg.wait_for_timeout(400)
def names(pg): return [x.inner_text() for x in pg.locator('.td-att .att-tx b').all()]
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,service_workers='block',accept_downloads=True)
    ctx.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
    login(pg)
    info=pg.evaluate("""async(b64)=>{const o=await import('./src/services/operators.js'); const op=o.operatorList()[0];
      const t=await o.saveTrip({operatorId:op.id,division:'puerto',date:'2026-10-07',reference:'MSCU1234567',origin:'Manzanillo',destination:'Guadalajara',fare:1500000,travelExpenses:0,commissionRate:15});
      const m=await import('./src/services/media.js'); const d=await import('./src/services/documents.js');
      const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); const blob=new Blob([bin],{type:'application/pdf'});
      const pdfId=await m.saveBlob(blob,{owner:'doc:dx1',kind:'pdf',name:'50-261007-001.pdf'});
      await d.saveDocument({id:'dx1',type:'puerto',company:'perconsur',folio:'50-261007-001',createdAt:Date.now(),status:'generado',summary:{empresa:'PERCONSUR',operador:op.name,contenedores:['MSCU1234567']},data:{folio:'50-261007-001',fecha:'2026-10-07',hora:'08:00',operador:op.name,conts:[{num:'MSCU1234567',tipo:'45G1'}],attachments:[]},pdfId,previewIds:[],filename:'50-261007-001.pdf',pages:2,size:blob.size});
      return {op:op.id,trip:t.id}}""", ORIG)
    open_trip(pg, info['op'], info['trip'])
    box=pg.locator('[data-tripdocs]')
    ok('Sin documento principal' in box.inner_text() and 'Sin documentos adicionales' in box.inner_text(),'estado inicial: sin documento principal ni adicionales')
    shot(pg,'t01_detalle_vacio')
    files=[os.path.join(FD,f) for f in ['Carta-Porte.pdf','Ticket combustible.jpg','Evidencia entrega.png','Acuse.pdf','Dañado.pdf','notas.txt']]
    pg.locator('[data-td-files]').set_input_files(files); pg.wait_for_timeout(2500)
    n=names(pg); ok(n==['Carta-Porte.pdf','Ticket combustible.jpg','Evidencia entrega.png','Acuse.pdf','Dañado.pdf'],'varios archivos en una acción, en orden; .txt rechazado: '+str(n))
    metas=[x.inner_text() for x in pg.locator('.td-att .att-tx small').all()]
    ok(metas[0].startswith('PDF · 3 páginas ·') and metas[1].startswith('Imagen ·') and metas[3].startswith('PDF · 2 páginas'),'metadatos: '+' | '.join(metas[:4]))
    ok('No se pudo procesar este archivo' in metas[4] and pg.locator('.td-att.err [data-ta="retry"]').count()==1,'archivo dañado: aviso con Reintentar/Eliminar')
    shot(pg,'t02_adjuntos')
    # vincular documento principal
    pg.locator('[data-td="link"]').click(); pg.wait_for_selector('.picker'); pg.locator('.picker .pk-row',has_text='50-261007-001').click(); pg.wait_for_timeout(700)
    ok('Nota de entrega 50-261007-001' in box.inner_text() and 'Documento principal · 2 páginas' in box.inner_text(),'documento relacionado vinculado y visible')
    # reordenar: Ticket (2) sube a 1
    pg.locator('.td-att',has_text='Ticket combustible.jpg').locator('[data-ta="up"]').click(); pg.wait_for_timeout(400)
    ok(names(pg)[:2]==['Ticket combustible.jpg','Carta-Porte.pdf'],'subir cambia el orden')
    pg.locator('.td-att',has_text='Ticket combustible.jpg').locator('[data-ta="down"]').click(); pg.wait_for_timeout(400)
    ok(names(pg)[:2]==['Carta-Porte.pdf','Ticket combustible.jpg'],'bajar restaura el orden')
    # renombrar desde el menú
    pg.locator('.td-att',has_text='Acuse.pdf').locator('[data-ta="more"]').click(); pg.wait_for_selector('.asheet'); shot(pg,'t03_menu'); pg.get_by_role('button',name='Cambiar nombre').click(); pg.wait_for_timeout(400)
    pg.fill('.bsheet [name=n]','Acuse de recibo.pdf'); pg.locator('.bsheet button[type=submit]').last.click(); pg.wait_for_timeout(500)
    ok('Acuse de recibo.pdf' in names(pg),'cambiar nombre')
    # reintentar dañado (falla) y eliminar
    pg.locator('.td-att.err [data-ta="retry"]').click(); pg.wait_for_timeout(1200)
    ok(pg.locator('.td-att.err').count()==1,'reintentar un archivo dañado no rompe nada')
    # vista previa
    pg.locator('[data-td="preview"]').click(); pg.wait_for_selector('.td-preview'); pg.wait_for_timeout(500)
    secs=[x.inner_text().replace('\n',' | ') for x in pg.locator('.td-sech').all()]
    ok(len(secs)==5 and 'Documento original' in secs[0] and 'Páginas 1 a 2' in secs[0] and 'Páginas 3 a 5' in secs[1] and 'Página 6' in secs[2] and 'Página 7' in secs[3] and 'Páginas 8 a 9' in secs[4],'vista previa en el orden real: '+' || '.join(secs))
    ok('Se omitirá' in pg.locator('.bsheet').last.inner_text(),'vista previa avisa del archivo que se omitirá')
    ok(pg.locator('.td-pg img').count()==2,'miniaturas de las imágenes en la vista previa')
    shot(pg,'t04_preview'); pg.mouse.wheel(0,900); pg.wait_for_timeout(300); shot(pg,'t04b_preview')
    # generar
    pg.locator('.bsheet [data-build]').last.click(); pg.wait_for_selector('.td-index',timeout=20000); pg.wait_for_timeout(300)
    txt=pg.locator('.bsheet').last.inner_text()
    ok('Expediente-MSCU1234567-' in txt and '9 páginas' in txt,'PDF consolidado generado: nombre y páginas')
    ok('No se pudo procesar: Dañado.pdf' in txt,'el archivo dañado se omite sin cancelar')
    shot(pg,'t05_generado')
    # descargar (escritorio sin share) → validar el PDF real
    with pg.expect_download() as dl: pg.locator('[data-x="save"]').click()
    path=dl.value.path(); data=open(path,'rb').read(); fn=dl.value.suggested_filename
    pg.keyboard.press('Escape')
    chk=pg.evaluate("""async(b)=>{await (await import('./src/services/libs.js')).loadLib('pdflib'); const d=await PDFLib.PDFDocument.load(Uint8Array.from(atob(b),c=>c.charCodeAt(0)));
       return d.getPages().map(p=>{const s=p.getSize(); return Math.round(s.width)+'x'+Math.round(s.height)})}""", base64.b64encode(data).decode())
    ok(len(chk)==9 and chk[5]=='792x612' and chk[6]=='792x612','páginas: '+','.join(chk)+' (imágenes horizontales en página horizontal)')
    ok(fn.startswith('Expediente-MSCU1234567-') and fn.endswith('.pdf'),'nombre de archivo: '+fn)
    # texto conservado del PDF (no rasterizado): buscar flujos con texto
    raw=data; texts=[]
    for m_ in re.finditer(rb'stream\r?\n(.*?)\r?\nendstream', raw, re.S):
        s=m_.group(1)
        try: s=zlib.decompress(s)
        except Exception: pass
        texts.append(s)
    allt=b' '.join(texts)
    order=[allt.find(x) for x in [b'Nota original pagina 1',b'Carta Porte pagina 1']]
    ok(all(o>=0 for o in order),'el texto de los PDF se conserva (páginas copiadas, no imágenes)')
    # original intacto
    same=pg.evaluate("""async(b)=>{const m=await import('./src/services/media.js'); const d=await (await import('./src/services/documents.js')).getDocument('dx1'); const bl=await m.getBlob(d.pdfId); const u=new Uint8Array(await bl.arrayBuffer()); const o=Uint8Array.from(atob(b),c=>c.charCodeAt(0)); return u.length===o.length && u.every((x,i)=>x===o[i])}""", ORIG)
    ok(same,'el documento relacionado original queda intacto')
    # eliminar dañado
    pg.locator('.td-att.err [data-ta="del"]').click(); pg.wait_for_selector('.asheet'); pg.get_by_role('button',name='Eliminar documento').click(); pg.wait_for_timeout(500)
    ok(len(names(pg))==4,'eliminar con confirmación')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    ok(pg.locator(f'[data-trip="{info["trip"]}"] .att-count').inner_text().strip()=='4','indicador de adjuntos en la tarjeta del viaje'); shot(pg,'t06_tarjeta')
    # persistencia
    pg.reload(); pg.wait_for_timeout(1200); open_trip(pg, info['op'], info['trip'])
    ok(names(pg)==['Carta-Porte.pdf','Ticket combustible.jpg','Evidencia entrega.png','Acuse de recibo.pdf'],'persisten tras recargar, en el mismo orden')
    # Cobranza muestra el indicador
    pg.goto(BASE+'#/cobranza'); pg.wait_for_timeout(800); ok(pg.locator(f'[data-trip="{info["trip"]}"] .att-count').count()==1,'indicador también en Cobranza')
    # respaldo
    r=pg.evaluate("""async()=>{const m=await import('./src/services/backup.js'); const a=JSON.parse(await (await m.exportBackup({includeMedia:false})).text()); const f=JSON.parse(await (await m.exportBackup({includeMedia:true})).text());
       const own=(o)=>o.data.attachments.filter(x=>String(x.owner).startsWith('trip:')).length; return {meta:a.data.tripAttachments.length, dataBin:own(a), fullBin:own(f), full:JSON.stringify(f)}}""")
    ok(r['meta']==4 and r['dataBin']==0 and r['fullBin']==4,f"respaldo: metadatos siempre ({r['meta']}), archivos solo en completo ({r['fullBin']})")
    full=r['full']
    # importar en otro dispositivo (contexto limpio)
    ctx2=b.new_context(viewport={'width':390,'height':844},is_mobile=True,service_workers='block'); ctx2.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    p2=ctx2.new_page(); p2.on('pageerror',lambda e:errs.append('p2 '+str(e)))
    login(p2)
    op2=p2.evaluate("""async([j,tid])=>{const m=await import('./src/services/backup.js'); const info=await m.inspectBackup(new File([j],'r.json')); await m.importBackup(info); const o=await import('./src/services/operators.js'); return o.allTrips().find(t=>t.id===tid).operatorId}""", [full, info['trip']])
    open_trip(p2, op2, info['trip'])
    ok(names(p2)==['Carta-Porte.pdf','Ticket combustible.jpg','Evidencia entrega.png','Acuse de recibo.pdf'] and p2.locator('.td-att.err').count()==0,'importar respaldo completo conserva la relación viaje–adjuntos')
    ok('Nota de entrega 50-261007-001' in p2.locator('[data-tripdocs]').inner_text(),'y el documento principal')
    pg.emulate_media(color_scheme='dark'); open_trip(pg, info['op'], info['trip']); pg.locator('.bsheet-body').last.evaluate('e=>e.scrollTop=400'); pg.wait_for_timeout(300); shot(pg,'t07_dark')
    b.close()
finally:
  srv.terminate(); shutil.rmtree(FD, ignore_errors=True)
print('\n'.join(log)); print('ERRORES:',errs)
