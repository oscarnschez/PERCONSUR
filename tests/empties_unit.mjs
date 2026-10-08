import { excelRowEmpty, excelValues, EXCEL_COLUMNS, missingForCode, isOverdue, sortPending, priority, containersIn, isContainer, isSchedulable, emptyStatus, EMPTY_STATUSES } from '../src/domain/empties/empties.js';
const ok = (c, m) => console.log((c ? 'OK  ' : 'FAIL') + ' ' + m);
// Columnas y orden del Excel «Control de vacíos» del usuario
ok(EXCEL_COLUMNS.join(' | ') === 'CONTENEDOR | OPERADOR QUE ENTREGA | ¿ENTREGADO CON OTRO TRANSPORTISTA? | TRANSPORTISTA (SI APLICA) | PATIO DE ENTREGA | FECHA DE ENTREGA | HORA DE ENTREGA | ¿ENTREGADO? | OBSERVACIONES', '9 columnas en el orden del Excel');
// Filas reales de la captura
const row1 = excelRowEmpty({ containerNumber: 'ONEU2824839', status: 'delivered', actualDeliveryDate: '2026-10-05', actualDeliveryTime: '07:00' }, { deliveryOperator: 'Rogelio Correa Mejía', yard: 'SSA EXTERNO' });
ok(row1 === 'ONEU2824839\tRogelio Correa Mejia\tNo\t \tSSA EXTERNO\t05/10/2026\t07:00\tSi\t ', 'fila 1 del Excel (entregado): ' + JSON.stringify(row1));
const row4 = excelRowEmpty({ containerNumber: 'MIEU0056003', status: 'delivered', actualDeliveryDate: '2026-10-05', actualDeliveryTime: '20:00' }, { deliveryOperator: 'Víctor Antonio Álvarez Haro', yard: 'ALSECONT' });
ok(row4.split('\t')[1] === 'Victor Antonio Alvarez Haro', 'sin acentos para Scan-IT to Office');
const pend = { containerNumber: 'FSCU5015234', status: 'scheduled', scheduledDeliveryDate: '2026-10-09', scheduledDeliveryTime: '10:30', deliveryOperatorId: 'o1', yardId: 'y1' };
ok(excelValues(pend, { deliveryOperator: 'Rogelio Correa Mejía', yard: 'SSA EXTERNO' })[7] === 'No', 'pendiente: ¿ENTREGADO? = No, con fecha y hora programadas');
const ext = { containerNumber: 'TIIU7489752', status: 'scheduled', externalCarrier: true, externalCarrierName: 'TRANSPORTES SOL', externalDriverName: 'Luis', scheduledDeliveryDate: '2026-10-09', scheduledDeliveryTime: '11:00', yardId: 'y1', notes: 'Llamar\tantes' };
const ve = excelValues(ext, { yard: 'SSA EXTERNO' });
ok(ve[1] === 'Luis' && ve[2] === 'Sí' && ve[3] === 'TRANSPORTES SOL', 'otro transportista: operador externo, «Sí» y transportista');
ok(excelRowEmpty(ext, { yard: 'SSA EXTERNO' }).split('\t').length === 9, 'un tabulador dentro de Observaciones no recorre columnas');
// Validación
ok(missingForCode({ containerNumber: 'ONEU2824839', status: 'pending' }, {}).join(' | ') === 'Falta seleccionar el operador que entrega. | Falta seleccionar el patio de entrega. | Falta la fecha de entrega. | Falta la hora de entrega.', 'faltantes exactos');
ok(missingForCode(pend, { deliveryOperator: 'X', yard: 'Y' }).length === 0, 'completo: sin faltantes');
ok(missingForCode({ ...ext, externalCarrierName: '' }, { yard: 'Y' })[0] === 'Falta escribir el transportista que entrega.', 'externo sin transportista');
// Estados, vencidas y prioridad
ok(EMPTY_STATUSES.map((s) => s.label).join(', ') === 'Pendiente de asignar, Programado, En traslado, Entregado', 'estados visibles');
const now = new Date(2026, 9, 8, 12, 0);
const a = { id: 'a', status: 'scheduled', scheduledDeliveryDate: '2026-10-07', scheduledDeliveryTime: '20:00', createdAt: 1 };
const bb = { id: 'b', status: 'scheduled', scheduledDeliveryDate: '2026-10-08', scheduledDeliveryTime: '16:30', createdAt: 2 };
const c = { id: 'c', status: 'scheduled', scheduledDeliveryDate: '2026-10-10', scheduledDeliveryTime: '09:00', createdAt: 3 };
const d = { id: 'd', status: 'pending', createdAt: 4 };
const e = { id: 'e', status: 'scheduled', scheduledDeliveryDate: '2026-10-08', scheduledDeliveryTime: '11:00', createdAt: 5 };
ok(isOverdue(a, now) && isOverdue(e, now) && !isOverdue(bb, now) && !isOverdue({ ...a, status: 'delivered' }, now), 'entrega vencida (fecha u hora pasada, sin entregar)');
ok(sortPending([d, c, bb, a, e], now).map((x) => x.id).join('') === 'aebcd', 'orden: vencidas, hoy, próximas, sin fecha');
ok(priority(d, now) === 3 && priority(bb, now) === 1, 'prioridades');
// Contenedores
ok(containersIn('Ref MSCU1234567 / tghu-7654321').join(',') === 'MSCU1234567,TGHU7654321', 'detecta contenedores en la referencia');
ok(!isContainer('CP-12345') && isContainer('mscu 1234567'), 'formato 4 letras + 7 números');
ok(isSchedulable(pend) && !isSchedulable({ ...pend, yardId: null }), 'programable con quién entrega, patio y fecha');
ok(emptyStatus('xyz').key === 'pending', 'estado desconocido → pendiente');
