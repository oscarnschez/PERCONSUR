/*
 * Filas de filtros que se desplazan de lado (.filters): un degradado en el borde indica que hay más chips de ese lado
 * (clases fade-l / fade-r, ver components.css). Se aplica sola a las filas nuevas de cualquier pantalla.
 */
export function initScrollHints() {
  const seen = new WeakSet();
  const update = (el) => {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('fade-l', max > 2 && el.scrollLeft > 2);
    el.classList.toggle('fade-r', max > 2 && el.scrollLeft < max - 2);
  };
  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll('.filters').forEach((el) => {
      if (!seen.has(el)) { seen.add(el); el.addEventListener('scroll', () => update(el), { passive: true }); }
      update(el);
    });
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(scan); } };
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', queue);
  queue();
}
