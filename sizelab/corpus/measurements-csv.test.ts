import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv, type MeasurementRow } from './measurements-csv';

const rows: MeasurementRow[] = [
  { id: 'producer', measured: [{ op: 4, mode: 'cc' }], producerCount: 0, importBytes: 0, uncompressed: 13000, shrinkled: 4300 },
  { id: 'op2_Vc', measured: [{ op: 2, mode: 'Vc' }], producerCount: 1, importBytes: 0, uncompressed: 13100, shrinkled: 4350 },
];

describe('measurements csv', () => {
  it('round-trips rows through toCsv/parseCsv', () => {
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('has a header line and one row per measurement', () => {
    const lines = toCsv(rows).trim().split('\n');
    expect(lines[0]).toBe('id,measured,producerCount,importBytes,uncompressed,shrinkled');
    expect(lines).toHaveLength(1 + rows.length);
  });
  it('round-trips a multi-phase measured array', () => {
    const multi: MeasurementRow[] = [
      { id: 'twophase_op2', measured: [{ op: 2, mode: 'cc' }, { op: 2, mode: 'cc' }], producerCount: 0, importBytes: 0, uncompressed: 1, shrinkled: 2 },
    ];
    expect(parseCsv(toCsv(multi))).toEqual(multi);
  });
});
