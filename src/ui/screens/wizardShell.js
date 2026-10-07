/* Armazón de los asistentes: encabezado con paso actual, barra de progreso y barra de acciones fija. */
import { el } from '../../core/dom.js';
import { esc } from '../../domain/shared/format.js';
import { icon } from '../components/icons.js';
import { actionSheet } from '../components/sheet.js';

export function wizardShell({ kind, steps, i, chip = '', nextLabel = 'Continuar', backLabel = 'Atrás' }) {
  const N = steps.length;
  const root = el(`<div class="wiz">
    <header class="wiz-top">
      <button type="button" class="icon-btn" data-w="close" aria-label="Cerrar y guardar borrador">${icon.close}</button>
      <button type="button" class="wiz-title" data-w="jump" aria-label="Ir a otro paso"><small>Paso ${i + 1} de ${N} | ${esc(kind)}</small><b>${esc(steps[i].title)}</b></button>
      ${chip}
    </header>
    <div class="wiz-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${N}" aria-valuenow="${i + 1}"><i style="width:${((i + 1) / N) * 100}%"></i></div>
    <main class="wiz-body"></main>
    <footer class="actionbar">
      <button type="button" class="btn-secondary" data-w="back">${icon.back}<span>${esc(backLabel)}</span></button>
      <button type="button" class="btn-primary" data-w="next"><span>${esc(nextLabel)}</span></button>
    </footer>
  </div>`);
  const h = {};
  root.querySelector('[data-w="next"]').addEventListener('click', () => h.next && h.next());
  root.querySelector('[data-w="back"]').addEventListener('click', () => h.back && h.back());
  root.querySelector('[data-w="close"]').addEventListener('click', () => h.close && h.close());
  root.querySelector('[data-w="jump"]').addEventListener('click', async () => {
    const v = await actionSheet({ title: 'Ir al paso', actions: steps.map((st, k) => ({ label: `${k + 1}. ${st.title}`, value: String(k), style: k === i ? 'primary' : '' })) });
    if (v != null && +v !== i && h.jump) h.jump(+v);
  });
  return {
    el: root, body: root.querySelector('.wiz-body'),
    onNext: (f) => { h.next = f; }, onBack: (f) => { h.back = f; }, onClose: (f) => { h.close = f; }, onJump: (f) => { h.jump = f; },
  };
}
