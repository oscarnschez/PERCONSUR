"""Seguridad: un respaldo manipulado (estado/páginas/división con HTML, logotipo de empresa, lastCompany, dirección del GPS,
adjunto HTML, borrador con datos raros) no ejecuta código ni cambia la configuración del GPS; «Abrir PDF» nunca abre
HTML; la CSP bloquea manejadores en línea y permite el script del tema. PCS_TEST_USER/PCS_TEST_PASS"""
import subprocess, time, sys, os, json, base64
from playwright.sync_api import sync_playwright
APP=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); SH='shots'; os.makedirs(SH,exist_ok=True)
U=os.environ['PCS_TEST_USER']; P=os.environ['PCS_TEST_PASS']
BASE='http://127.0.0.1:8781/index.html'
srv=subprocess.Popen([sys.executable,'-m','http.server','8781','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
errs=[]; csp=[]; log=[]
def ok(c,m): log.append(('OK  ' if c else 'FAIL')+' '+m)
X=lambda n: f'x"><img src=x id=pwn{n} onerror="window.__xss=(window.__xss||0)+1">'
B64=base64.b64encode(b'<script>window.__blobxss=1</script>').decode()
now=int(time.time()*1000)
BACKUP={"app":"perconsur","format":1,"data":{
 "documents":[{"id":"poc1","type":"puerto","company":"perconsur","folio":"POC-1","status":X(1),"createdAt":now+10**9,"pages":X(2),"size":1,"data":{"folio":"POC-1"},"pdfId":"m_none","previewIds":[]}],
 "settings":[{"key":"lastCompany","value":X(3)},{"key":"gpsUrl","value":"https://evil.example"},{"key":"gpsKey","value":"robada"}],
 "companies":[{"key":"perconsur","overrides":{"logo":X(4),"track":X(5),"folioSerie":X(6),"legal":"PERCONSUR PRUEBA"}}],
 "operators":[{"id":"op_sec","company":"perconsur","name":"Operador Seguridad"}],
 "operatorTrips":[{"id":"t_sec","operatorId":"op_sec","division":X(7),"date":"2026-10-01","origin":"A","destination":"B","fare":100000,"travelExpenses":0,"createdAt":now,"updatedAt":now}],
 "operatorSettings":[{"operatorId":"op_sec","satManual":X(8),"satMode":"manual"}],
 "tripAttachments":[{"id":"ta_sec","tripId":"t_sec","name":"factura.pdf","mimeType":"text/html","kind":"pdf","status":"ok","order":1,"size":30,"storageKey":"m_sec","createdAt":now,"updatedAt":now},
                    {"id":"ta_bad","tripId":"t_sec","name":"raro","mimeType":"text/html","kind":X(9),"status":"ok","order":2,"size":3,"storageKey":"m_sec","createdAt":now,"updatedAt":now}],
 "attachments":[{"id":"m_sec","owner":"trip:t_sec","kind":"trip-file","type":"text/html","size":30,"b64":B64}],
 "drafts":[{"id":"puerto:perconsur","type":"puerto","company":"perconsur","step":X(10),"updatedAt":now+10**9,"data":{"folio":"90-000000-001","conts":[{}],"attachments":[{"id":"a1","kind":X(11),"name":"a","size":1,"pages":X(12)},{"id":"a2","kind":"pdf","name":"ok.pdf","size":10,"pages":2}]}}],
}}
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    ctx.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    ctx.route('https://gps.test/**', lambda r: r.fulfill(status=200, headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'X-PCS-Key','Content-Type':'application/json'}, body='{"ok":true,"devices":[]}' if r.request.method!='OPTIONS' else ''))
    ctx.route('https://evil.example/**', lambda r: (errs.append('EVIL CONTACTED '+str(r.request.headers.get('x-pcs-key'))), r.fulfill(status=200, headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'X-PCS-Key'}, body='{}'))[1])
    ctx.route('https://nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, body='[]', headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}))
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(pg.url.split('#')[-1]+' :: '+str(e))); pg.on('response',lambda r: errs.append('404 '+r.url) if r.status==404 else None)
    def con(m):
        if 'Content Security Policy' in m.text or 'Refused to' in m.text: csp.append(m.text[:160])
        elif m.type=='error': errs.append('console: '+m.text[:160])
    pg.on('console',con)
    pg.goto(BASE); pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login',state='detached'); pg.wait_for_timeout(900)
    if pg.locator('.asheet').count(): pg.get_by_role('button',name='Ahora no').click()
    ok(pg.locator('meta[http-equiv="Content-Security-Policy"]').count()==1,'CSP presente en index.html')
    pg.evaluate("async()=>{const g=await import('./src/services/gps.js'); await g.saveConfig({url:'https://gps.test',key:'k-local'})}")
    r=pg.evaluate("""async(o)=>{const m=await import('./src/services/backup.js'); const info=await m.inspectBackup(new File([JSON.stringify(o)],'r.json',{type:'application/json'})); await m.importBackup(info); return info.lines.length}""", BACKUP)
    ok(r>0,'respaldo manipulado importado sin error')
    pg.goto(BASE+'#/'); pg.wait_for_timeout(1500)
    def nopwn(where): 
        n=pg.evaluate("()=>document.querySelectorAll('[id^=pwn]').length"); x=pg.evaluate("()=>window.__xss||0")
        ok(n==0 and x==0, f'{where}: ninguna etiqueta inyectada ni script ejecutado ({n},{x})')
    nopwn('Inicio (documento reciente con estado manipulado)')
    pg.goto(BASE+'#/documentos'); pg.wait_for_timeout(700); nopwn('Documentos')
    pg.goto(BASE+'#/doc/poc1'); pg.wait_for_timeout(900); nopwn('Detalle del documento')
    pg.goto(BASE+'#/operadores/op_sec'); pg.wait_for_timeout(1000); nopwn('Operador (viaje con división manipulada)')
    pg.goto(BASE+'#/'); pg.wait_for_timeout(700)
    if pg.locator('[data-new="puerto"]').count():
        pg.locator('[data-new="puerto"]').first.click(); pg.wait_for_timeout(800); nopwn('Nueva nota (elección de empresa con lastCompany manipulado)')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    s=pg.evaluate("""async()=>{const st=await import('./src/services/settings.js'); const c=await import('./src/services/companies.js'); const cfg=await import('./src/config/companies.js'); const db=await import('./src/services/db.js');
      const a=await db.get('attachments','m_sec'); const ta=await db.all('tripAttachments'); const d=await db.get('documents','poc1'); const dr=await db.get('drafts','puerto:perconsur'); const os=await db.get('operatorSettings','op_sec'); const tr=await db.get('operatorTrips','t_sec');
      return {url:st.getSetting('gpsUrl'),key:st.getSetting('gpsKey'),last:st.getSetting('lastCompany'),logo:c.getCompany('perconsur').logo===cfg.COMPANY_DEFAULTS.perconsur.logo,legal:c.getCompany('perconsur').legal,serie:c.getCompany('perconsur').folioSerie===cfg.COMPANY_DEFAULTS.perconsur.folioSerie,
        atype:a&&a.type, ta:ta.map(x=>x.id+':'+x.kind+':'+x.mimeType), dstatus:d.status, dpages:d.pages, dstep:dr&&dr.step, datt:dr&&dr.data.attachments.map(x=>x.kind+':'+x.pages), sat:os&&os.satManual, div:tr&&tr.division}}""")
    ok(s['url']=='https://gps.test' and s['key']=='k-local','el respaldo no cambia la dirección ni la clave del GPS')
    ok(s['last']!=X(3),'lastCompany manipulado no se importa')
    ok(s['logo'] and s['serie'] and s['legal']=='PERCONSUR PRUEBA','empresa: solo se importan textos editables (logo y serie fijos)')
    ok(s['atype']=='application/octet-stream' and s['ta']==['ta_sec:pdf:application/pdf'],'adjuntos: tipo HTML neutralizado y kind inválido descartado')
    ok(s['dstatus']=='generado' and s['dpages']==0 and s['dstep']==0 and s['datt']==['pdf:2'],'documento y borrador: estado, páginas, paso y adjuntos normalizados')
    ok(s['sat'] is None and s['div']=='puerto','configuración y viaje: valores numéricos y división normalizados')
    pg.wait_for_timeout(1500)
    ok(not any('EVIL' in e for e in errs),'la clave del GPS nunca se envía a otro servidor')
    t=pg.evaluate("""async()=>{const s=await import('./src/services/share.js'); let url=null; const o=window.open; window.open=(u)=>{url=u; return {opener:1}}; s.openBlob(new Blob(['<script>window.__blobxss=1<\\/script>'],{type:'text/html'})); window.open=o; const b=await (await fetch(url)).blob(); return b.type}""")
    ok(t=='application/pdf','«Abrir PDF» nunca abre un archivo HTML como página (se abre como PDF): '+t)
    pg.evaluate("()=>{const d=document.createElement('div'); d.innerHTML='<img src=x onerror=\"window.__csp=1\">'; document.body.appendChild(d)}"); pg.wait_for_timeout(500)
    ok(pg.evaluate("()=>window.__csp")is None,'CSP bloquea manejadores en línea aunque llegaran al DOM')
    pg.reload(); pg.wait_for_timeout(800)
    ok(not any('inline script' in c for c in csp),'el script del tema no lo bloquea la CSP (hash correcto)')
    b.close()
finally:
  srv.terminate()
print('\n'.join(log)); print('ERRORES:',errs); print('CSP:',csp)
