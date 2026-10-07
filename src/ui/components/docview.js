/*
 * Vista previa del documento: muestra las hojas reales (816 px) escaladas al ancho disponible.
 * "Ampliar" alterna a tamaño real dentro de un contenedor desplazable (zoom para revisar detalle).
 */
import { icon } from './icons.js';

export function mountDocPreview(host, html, { sheetWidth = 816 } = {}) {
  host.classList.add('docview');
  host.innerHTML = `<div class="dv-frame"><div class="dv-scaler doc-root">${html}</div></div>
    <button type="button" class="dv-zoom btn-ghost sm">${icon.search}<span>Ampliar</span></button>`;
  const frame = host.querySelector('.dv-frame'), sc = host.querySelector('.dv-scaler'), zb = host.querySelector('.dv-zoom');
  let zoom = false;
  function fit() {
    const w = frame.clientWidth || host.clientWidth;
    const s = zoom ? Math.min(1, Math.max(0.75, w / sheetWidth * 1.9)) : Math.min(1, w / sheetWidth);
    sc.style.transform = `scale(${s})`;
    sc.style.width = sheetWidth + 'px';
    frame.style.height = (sc.offsetHeight * s) + 'px';
    frame.classList.toggle('zoomed', zoom);
  }
  zb.addEventListener('click', () => { zoom = !zoom; zb.querySelector('span').textContent = zoom ? 'Ajustar' : 'Ampliar'; fit(); });
  const ro = 'ResizeObserver' in window ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(host); else window.addEventListener('resize', fit);
  requestAnimationFrame(fit);
  host.querySelectorAll('img').forEach((im) => { if (!im.complete) im.addEventListener('load', fit, { once: true }); });
  return { refit: fit, destroy: () => ro && ro.disconnect() };
}
