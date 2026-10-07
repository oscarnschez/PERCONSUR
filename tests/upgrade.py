"""Actualización de la base de datos v1 → v2: los datos existentes deben conservarse."""
import subprocess, time, sys, os
from playwright.sync_api import sync_playwright
APP=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); U=os.environ['PCS_TEST_USER']; P=os.environ['PCS_TEST_PASS']
srv=subprocess.Popen([sys.executable,'-m','http.server','8771','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,service_workers='block'); ctx.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:8771/manifest.json')
    # Base v1 tal como la dejaba la versión 1.1.0
    pg.evaluate('''()=>new Promise((res)=>{const q=indexedDB.open('perconsur',1);q.onupgradeneeded=()=>{const d=q.result;
      for(const [n,k,ix] of [['documents','id',[['type','type'],['createdAt','createdAt']]],['drafts','id',[]],['operators','id',[['company','company']]],['vehicles','id',[['company','company']]],['trailers','id',[['company','company']]],['places','id',[]],['plants','id',[]],['terminals','id',[]],['companies','key',[]],['settings','key',[]],['attachments','id',[['owner','owner']]],['counters','id',[]]]){const s=d.createObjectStore(n,{keyPath:k});ix.forEach(([a,b])=>s.createIndex(a,b));}};
      q.onsuccess=()=>{const d=q.result,t=d.transaction(['operators','documents','settings','counters'],'readwrite');
        t.objectStore('operators').put({id:'op_viejo_1',company:'perconsur',name:'Operador Existente',order:0});
        t.objectStore('documents').put({id:'d_viejo',type:'puerto',company:'perconsur',folio:'50-261001-003',fecha:'2026-10-01',createdAt:Date.now()-86400000,status:'generado',summary:{empresa:'PERCONSUR',operador:'Operador Existente'},data:{folio:'50-261001-003'},previewIds:[],filename:'50-261001-003.pdf',pages:1});
        t.objectStore('settings').put({key:'seeded',value:true}); t.objectStore('counters').put({id:'folio:perconsur:261001',company:'perconsur',day:'261001',n:3});
        t.oncomplete=()=>{d.close();res()}}})''')
    pg.goto('http://127.0.0.1:8771/index.html'); pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login',state='detached'); pg.wait_for_timeout(1200)
    info=pg.evaluate('''()=>new Promise(r=>{const q=indexedDB.open('perconsur');q.onsuccess=()=>{const d=q.result;const g=(s)=>new Promise(x=>{const k=d.transaction(s).objectStore(s).getAll();k.onsuccess=()=>x(k.result)});
      Promise.all([g('operators'),g('documents'),g('counters')]).then(([o,dc,c])=>r({v:d.version,stores:[...d.objectStoreNames],ops:o.map(x=>x.name),docs:dc.map(x=>x.folio),counters:c.map(x=>x.id+'='+x.n)}))}})''')
    print('versión de la base:',info['v']); print('stores nuevas:',[s for s in info['stores'] if s.startswith('operator')])
    print('operadores conservados:',info['ops']); print('documentos conservados:',info['docs']); print('folios conservados:',info['counters'])
    pg.goto('http://127.0.0.1:8771/index.html#/operadores'); pg.wait_for_timeout(700); print('aparece en Operadores:',pg.locator('.op-row',has_text='Operador Existente').count()==1)
    print('errores:',errs or 'ninguno'); b.close()
finally: srv.terminate()
