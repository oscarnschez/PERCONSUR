/*
 * Ajustar en el mapa el punto de un destino:
 *   destino de una nota (dirección escrita) → se guarda para esa dirección y se reutiliza en toda nota con la misma
 *   patio, terminal, planta o destino del catálogo → se guarda en el registro del catálogo (pin)
 */
import { pickPoint } from '../components/pinPicker.js';
import { toast } from '../components/toast.js';
import { listAll, save as saveCatalog } from '../../services/catalogs.js';
import { setManual, clearManual, cached } from '../../services/geocode.js';

/* t: destino de services/destinations.js; ref: posición de la unidad para orientarse */
export async function adjustTarget(t, ref = null) {
  if (!t || !t.edit) return false;
  if (t.edit.type === 'catalog') {
    const rec = listAll(t.edit.kind).find((x) => x.id === t.edit.id);
    if (!rec) return false;
    const r = await pickPoint({ title: `Ubicar ${t.title.toLowerCase()}`, name: rec.name, address: rec.address || '', start: t.loc, zoom: t.loc ? 17 : 15, canClear: !!rec.pin, ref });
    if (!r) return false;
    await saveCatalog(t.edit.kind, { ...rec, pin: r === 'clear' ? null : r });
    window.dispatchEvent(new CustomEvent('geo:change'));
    toast(r === 'clear' ? 'Se quitó el punto fijado' : `Ubicación de ${rec.name} guardada en el catálogo`);
    return true;
  }
  const addr = t.edit.address, g = cached(addr);
  const r = await pickPoint({ title: 'Ubicar destino', name: t.name, address: addr, start: t.loc, zoom: t.loc && t.loc.precision === 'city' ? 12 : 17, canClear: !!(g && g.precision === 'manual'), ref });
  if (!r) return false;
  if (r === 'clear') { await clearManual(addr); toast('Se quitó el punto fijado; se buscará de nuevo la dirección'); }
  else { await setManual(addr, r); toast('Ubicación del destino guardada para esta dirección'); }
  return true;
}
