"""Prueba sin conexión: instala el service worker, corta la red, recarga y captura un documento."""
import subprocess, time, sys, os
from playwright.sync_api import sync_playwright

def login(pg):
    import os
    U=os.environ.get('PCS_TEST_USER'); P=os.environ.get('PCS_TEST_PASS')
    if not (U and P): raise SystemExit('Define PCS_TEST_USER y PCS_TEST_PASS (credenciales de acceso de la app)')
    pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login', state='detached', timeout=10000)

APP=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
SHIM=open(os.path.join(os.path.dirname(__file__),'shims.js')).read()
srv=subprocess.Popen([sys.executable,'-m','http.server','8767','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
res=[]
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    ctx.route(lambda u:'fonts.g' in u, lambda r:r.abort())
    ctx.route(lambda u:'cdnjs' in u, lambda r:r.fulfill(status=200,content_type='application/javascript',body=SHIM,headers={'access-control-allow-origin':'*'}))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://127.0.0.1:8767/index.html'); login(pg); pg.wait_for_timeout(1500)
    pg.evaluate('navigator.serviceWorker.ready'); pg.wait_for_timeout(2500)
    n=pg.evaluate("caches.keys().then(async ks=>{let t=0;for(const k of ks){t+=(await (await caches.open(k)).keys()).length}return [ks,t]})")
    res.append(f'cachés: {n}')
    ctx.set_offline(True)
    pg.reload(); pg.wait_for_timeout(2000)
    res.append('pantalla tras recargar sin red: '+str(pg.evaluate('document.body.dataset.screen')))
    pg.locator('[data-new="campo"]').click(); pg.wait_for_timeout(900)
    res.append('asistente sin red: '+str(pg.evaluate('document.body.dataset.screen')))
    res.append('errores: '+(';'.join(errs) or 'ninguno'))
    b.close()
finally: srv.terminate()
print('\n'.join(res))
