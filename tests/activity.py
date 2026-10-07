"""Actividad del operador: cuenta todos los viajes registrados y avisa los que quedan después del corte."""
import subprocess, time, sys, os
from playwright.sync_api import sync_playwright
APP=os.path.abspath(os.path.join(os.path.dirname(__file__),'..')); os.makedirs('shots',exist_ok=True)
U=os.environ['PCS_TEST_USER']; P=os.environ['PCS_TEST_PASS']; BASE='http://127.0.0.1:8773/index.html'
srv=subprocess.Popen([sys.executable,'-m','http.server','8773','--bind','127.0.0.1'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
log=[]; errs=[]
def ok(c,m): log.append(('OK  ' if c else 'FAIL')+' '+m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,service_workers='block')
    ctx.route(lambda u:'cdnjs' in u or 'fonts.g' in u, lambda r:r.abort())
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_selector('.login'); pg.fill('#lg-user',U); pg.fill('#lg-pass',P); pg.click('#lg-go'); pg.wait_for_selector('.login',state='detached'); pg.wait_for_timeout(900)
    if pg.locator('.asheet').count(): pg.get_by_role('button',name='Ahora no').click()
    # Alta del operador en el catálogo (como lo haría el usuario)
    pg.goto(BASE+'#/catalogos/operators'); pg.wait_for_timeout(600); pg.locator('[data-add]').first.click(); pg.wait_for_selector('.cat-form')
    pg.fill('.cat-form [name=name]','rogelio correa'); pg.locator('.cat-form button[type=submit]').click(); pg.wait_for_timeout(500)
    # 15 viajes hasta el 15/09, corte fijo al 15/09 y 1 viaje el 20/09
    pg.goto(BASE+'#/operadores'); pg.wait_for_timeout(600); pg.locator('.op-row',has_text='Rogelio Correa').click(); pg.wait_for_timeout(600)
    pg.evaluate('''async()=>{const o=await import('/src/services/operators.js'); const id=location.hash.split('/')[2];
      const add=(d,div)=>o.saveTrip({operatorId:id,division:div,date:d,origin:'Manzanillo',destination:'Guadalajara',fare:2000000,travelExpenses:100000,commissionRate:15,minEnabled:false,minAmount:250000,baseCommission:300000,expandedCommission:0,finalCommission:300000,isExpanded:false,notes:''});
      for(let i=1;i<=15;i++) await add('2026-09-'+String(i).padStart(2,'0'), i%4?'puerto':'campo');
      await add('2026-09-20','puerto');
      await o.saveSettings(id,{startDate:'2026-09-01',cutoffDate:'2026-09-15',satMode:'auto',satManual:null,weekly:300000,minEnabled:false,minAmount:250000},(k,v)=>String(v));}''')
    pg.reload(); pg.wait_for_timeout(1200)
    tiles=pg.locator('.tiles').first.inner_text(); excl=pg.locator('.op-excl').inner_text() if pg.locator('.op-excl').count() else ''
    ok(tiles.split('\n')[1].strip()=='16','Actividad muestra los 16 viajes registrados')
    ok('1 viaje no entra en el balance' in excl and '15/09/2026' in excl,'aviso claro: '+excl.replace('\n',' ')[:140])
    ok('15 viajes entran en el balance; 1 viaje queda después del corte' in pg.locator('.grp',has_text='Actividad').inner_text(),'detalle en Actividad: 15 en balance, 1 después del corte')
    ok(pg.locator('.bal-card').inner_text().count('+$45,000.00')==1,'el balance sigue considerando solo los 15 viajes dentro del corte ($45,000 en comisiones)')
    pg.screenshot(path='shots/a1_aviso_corte.png')
    pg.locator('[data-tab="viajes"]').click(); pg.wait_for_timeout(300)
    ok(pg.locator('.trip-card').count()==16 and pg.locator('.trip-card .after-tag').count()==1,'la lista de viajes muestra 16 y marca 1 "Después del corte"')
    pg.goto(BASE+'#/operadores'); pg.wait_for_timeout(600)
    row=pg.locator('.op-row',has_text='Rogelio Correa').inner_text()
    ok('16 viajes' in row and '1 viaje después del corte' in row,'el listado muestra 16 viajes y el aviso')
    pg.screenshot(path='shots/a2_listado.png')
    # Corregir: cambiar a «Hoy» desde el aviso
    pg.locator('.op-row',has_text='Rogelio Correa').click(); pg.wait_for_timeout(600)
    pg.locator('.op-excl [data-settings]').click(); pg.wait_for_selector('.op-form'); pg.locator('[data-cut="hoy"]').click(); pg.locator('.op-form button[type=submit]').click(); pg.wait_for_timeout(600)
    ok(pg.locator('.op-excl').count()==0 and '+$48,000.00' in pg.locator('.bal-card').inner_text(),'con «Hoy» desaparece el aviso y entran los 16 viajes (+$48,000)')
    pg.screenshot(path='shots/a3_corregido.png')
    b.close()
finally: srv.terminate()
print('\n'.join(log)); print('errores:','; '.join(errs) or 'ninguno')
