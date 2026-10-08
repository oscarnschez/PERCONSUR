"""Expediente consolidado desde el detalle del documento y desde Logística («Ver documento relacionado»). PCS_TEST_USER/PCS_TEST_PASS"""
import subprocess, time, sys, os, json, base64, tempfile, shutil, zlib, re
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__)); APP=os.path.abspath(os.path.join(HERE,'..')); SH='shots'; os.makedirs(SH,exist_ok=True)
U=os.environ['PCS_TEST_USER']; P=os.environ['PCS_TEST_PASS']; BASE='http://127.0.0.1:8777/index.html'
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
srv=subprocess.Popen([sys.executable,'-m','http.server','8777','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]; log=[]
def ok(c,m): log.append(('OK  ' if c else 'FAIL')+' '+m)
def shot(pg,n): pg.screenshot(path=f'{SH}/dx_{n}.png')
def login(pg):
    pg.goto(BASE); pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login',state='detached'); pg.wait_for_timeout(900)
    if pg.locator('.asheet').count(): pg.get_by_role('button',name='Ahora no').click()
ORIG=base64.b64encode(open(os.path.join(FD,'original.pdf'),'rb').read()).decode()
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,service_workers='block')
    ctx.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
    login(pg)
    info=pg.evaluate("""async(b64)=>{const o=await import('./src/services/operators.js'); const op=o.operatorList()[0];
      const m=await import('./src/services/media.js'); const d=await import('./src/services/documents.js');
      const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); const blob=new Blob([bin],{type:'application/pdf'});
      const pdfId=await m.saveBlob(blob,{owner:'doc:dx1',kind:'pdf',name:'90-261008-001.pdf'});
      await d.saveDocument({id:'dx1',type:'puerto',company:'osc',folio:'90-261008-001',createdAt:Date.now(),status:'generado',summary:{empresa:'OSC',operador:op.name,contenedores:['FSCU5015234']},data:{folio:'90-261008-001',fecha:'2026-10-08',hora:'02:05',operador:op.name,eco:'12',placasU:'60-BN-4J',placasR:'08-UW-6K',conts:[{num:'FSCU5015234',tipo:'42G0'}],destNombre:'GRUPO INDUSTRIAL SWEETS',destDir:'Guadalajara, Jalisco',attachments:[]},pdfId,previewIds:[],filename:'90-261008-001.pdf',pages:2,size:blob.size});
      const t=await o.saveTrip({operatorId:op.id,division:'puerto',date:'2026-10-08',reference:'FSCU5015234',origin:'Manzanillo',destination:'Guadalajara',fare:1500000,travelExpenses:0,commissionRate:15,documentId:'dx1'});
      const ta=await import('./src/services/tripAttachments.js');
      const f=async(u,n)=>new File([await (await fetch(u)).blob()],n);
      return {op:op.id,trip:t.id}}""", ORIG)
    # adjuntar 2 archivos vía la interfaz del viaje
    pg.goto(BASE+f"#/operadores/{info['op']}?viaje={info['trip']}"); pg.wait_for_selector('[data-tripdocs] .td-add',timeout=8000); pg.wait_for_timeout(500)
    ok('Nota de entrega 90-261008-001' in pg.locator('[data-tripdocs]').inner_text(),'?viaje= abre el detalle del viaje con su documento relacionado')
    pg.locator('[data-td-files]').set_input_files([os.path.join(FD,'Carta-Porte.pdf'),os.path.join(FD,'Ticket combustible.jpg')]); pg.wait_for_timeout(1500)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    # operación de Logística vinculada al viaje y al documento
    pg.evaluate("""async(tid)=>{const l=await import('./src/services/logistics.js'); const u=l.units()[0]; await l.saveOperation({vehicleId:u.id,operatorId:null,trailerId:null,division:'puerto',status:'empty',origin:'Manzanillo',destination:'Guadalajara',reference:'FSCU5015234',deliveryPlace:'Grupo Industrial Sweets',tripId:tid,documentId:'dx1'}); return u.id}""", info['trip'])
    vid=pg.evaluate("async()=>(await import('./src/services/logistics.js')).units()[0].id")
    pg.goto(BASE+'#/operacion/logistica/u/'+vid); pg.wait_for_timeout(700)
    dd=pg.locator('dd',has_text='Ver documento relacionado')
    ok(dd.count()==1 and 'documento + 2 adicionales' in dd.inner_text(),'Logística: enlace con aviso del expediente: '+dd.inner_text().replace('\n',' | '))
    dd.scroll_into_view_if_needed(); shot(pg,'x01_logistica')
    pg.get_by_text('Ver documento relacionado').click(); pg.wait_for_selector('.td-index',timeout=15000); pg.wait_for_timeout(400)
    txt=pg.locator('.bsheet').last.inner_text()
    ok('/doc/dx1' in pg.url and 'Expediente-FSCU5015234-' in txt and '6 páginas' in txt,'el clic abre el expediente consolidado (2 + 3 + 1 = 6 páginas)')
    shot(pg,'x02_consolidado')
    pg.locator('.bsheet-x').last.click(); pg.wait_for_timeout(400)
    card=pg.locator('.xp'); ok(card.count()==1 and 'Este documento + 2 documentos adicionales' in card.inner_text(),'tarjeta Expediente consolidado en el detalle del documento')
    shot(pg,'x03_doc')
    card.locator('[data-xp="view"]').click(); pg.wait_for_selector('.td-index',timeout=15000); ok(True,'Ver expediente consolidado desde el documento'); pg.locator('.bsheet-x').last.click(); pg.wait_for_timeout(300)
    card.locator('[data-xp="order"]').click(); pg.wait_for_selector('.td-preview'); ok(pg.locator('.td-sech').count()==3,'Orden y páginas'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    card.get_by_text('Administrar documentos adicionales').click(); pg.wait_for_selector('[data-tripdocs] .td-att',timeout=8000); ok(pg.locator('[data-tripdocs] .td-att').count()==2,'Administrar abre el viaje con sus adjuntos')
    # documento sin viaje: sin tarjeta; documentos sin adjuntos: tarjeta informativa
    pg.evaluate("""async()=>{const ta=await import('./src/services/tripAttachments.js'); const o=await import('./src/services/operators.js'); const t=o.allTrips()[0]; for(const a of ta.listFor(t.id)) await ta.remove(a.id);}""")
    pg.goto(BASE+'#/doc/dx1'); pg.wait_for_timeout(700)
    ok('aún no tiene documentos adicionales' in pg.locator('.xp').inner_text() and pg.locator('.xp [data-xp]').count()==0,'sin adjuntos: tarjeta informativa con «Añadir documentos al viaje»')
    pg.goto(BASE+'#/operacion/logistica/u/'+vid); pg.wait_for_timeout(600)
    pg.get_by_text('Ver documento relacionado').click(); pg.wait_for_timeout(900)
    ok('/doc/dx1' in pg.url and pg.locator('.td-index').count()==0,'sin adjuntos: el enlace abre el documento (es su propio expediente)')
    b.close()
finally:
  srv.terminate(); shutil.rmtree(FD, ignore_errors=True)
print('\n'.join(log)); print('ERRORES:',errs)
