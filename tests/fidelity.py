import subprocess, time, sys, json, base64, datetime, os
from playwright.sync_api import sync_playwright

def login(pg):
    import os
    U=os.environ.get('PCS_TEST_USER'); P=os.environ.get('PCS_TEST_PASS')
    if not (U and P): raise SystemExit('Define PCS_TEST_USER y PCS_TEST_PASS (credenciales de acceso de la app)')
    pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login', state='detached', timeout=10000)

SHIM=open('shims.js').read()
today=datetime.date.today(); key=today.strftime('%y%m%d'); fecha=today.isoformat()
photo='data:image/jpeg;base64,'+base64.b64encode(open('foto.jpg','rb').read()).decode()
draft={'folio':f'50-{key}-007','fecha':fecha,'hora':'08:15','bl':'MEDUAB123456','cartaPorte':'CP-889','pedimento':'26 16 1641 6005426','operador':'Juan Alberto García Correa','eco':'21','placasU':'61-BN-4J','placasR':'08-UW-6K',
  'destNombre':'ALMACEN CENTRAL','destRFC':'ABC010101AB1','destDir':'Av. Vallarta 100, Zapopan, Jalisco, C.P. 45010','destContacto':'33 1234 5678','obsDan':'Golpe lateral','obsFal':'','obs':'Sin novedad','modal':'imp','trafico':'FCL','custodia':True,
  'track':'tinyurl.com/MSCU1234565','trackAuto':True,'showTrack':True,'citaFecha':fecha,'citaHora':'14:30','terminal':'SSA','rfcE':'','rfcR':'',
  'conts':[{'num':'MSCU1234565','tipo':'45G1','sello':'S-1','merc':'Refacciones','bultos':'12','peso':'18500','tara':'3800','tarifa':'10000','iva':True,'isr':True,'sobre':True,'sobreMonto':'500','fotos':{'puertas':{'src':photo,'t':1700000000000},'izq':{'src':photo,'t':1700000000000}}}]}
srv = subprocess.Popen([sys.executable,'-m','http.server','8766','--bind','127.0.0.1'], cwd=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':1900,'height':1300}, service_workers='block')
    ctx.route(lambda u: 'cdnjs' in u, lambda r: r.fulfill(status=200, content_type='application/javascript', body=SHIM))
    ctx.route(lambda u: 'fonts.g' in u, lambda r: r.abort())
    pg=ctx.new_page()
    pg.goto('http://127.0.0.1:8766/manifest.json')
    pg.evaluate('d=>{localStorage.setItem("ner-draft",JSON.stringify(d));localStorage.setItem("ner-company",JSON.stringify("perconsur"));sessionStorage.setItem("ner-skip-pick","1")}', draft)
    # original
    pg.goto('http://127.0.0.1:8766/__orig.html'); pg.wait_for_timeout(2500)
    pg.evaluate("document.querySelector('#scaler').style.transform='none'")
    pg.locator('#mainSheet .sheet').screenshot(path='fid_orig_main.png')
    pg.locator('#annex .sheet').first.screenshot(path='fid_orig_annex.png')
    # nueva (migra el mismo borrador)
    pg.goto('http://127.0.0.1:8766/index.html'); login(pg); pg.wait_for_timeout(2500)
    pg.evaluate('''async()=>{ const f=await import('/src/ui/flows.js'); const d=await (await import('/src/services/drafts.js')).getDraft('puerto:perconsur');
      await f.ensureDocAssets('puerto', d.data); const w=document.createElement('div'); w.className='doc-root'; w.id='fid';
      w.style.cssText='position:absolute;left:0;top:0;width:816px;z-index:5000;background:#888'; w.innerHTML=f.docHTML('puerto', d.data,'perconsur'); document.body.appendChild(w); }''')
    pg.wait_for_timeout(800)
    pg.locator('#fid .sheet').first.screenshot(path='fid_new_main.png')
    pg.locator('#fid .sheet.annex').first.screenshot(path='fid_new_annex.png')
    b.close()
finally: srv.terminate()
from PIL import Image, ImageChops
for a,bn in [('fid_orig_main.png','fid_new_main.png'),('fid_orig_annex.png','fid_new_annex.png')]:
    A=Image.open(a).convert('RGB'); B=Image.open(bn).convert('RGB'); print(a, A.size, bn, B.size)
    if A.size==B.size:
        d=ImageChops.difference(A,B); bb=d.getbbox(); px=sum(1 for v in d.convert('L').getdata() if v>40); print('  píxeles distintos (>40):',px,'de',A.size[0]*A.size[1],'bbox',bb)
A=Image.open('fid_orig_main.png'); B=Image.open('fid_new_main.png')
c=Image.new('RGB',(A.width+B.width+20,max(A.height,B.height)),(90,90,90)); c.paste(A,(0,0)); c.paste(B,(A.width+20,0)); c.save('/tmp/fid_main.png')
