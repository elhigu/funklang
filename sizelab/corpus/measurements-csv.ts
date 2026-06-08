import type { PhaseDesc } from './corpus-spec';

export interface MeasurementRow {
  id: string;
  measured: PhaseDesc[];
  producerCount: number;
  importBytes: number;
  uncompressed: number; // a.mingw.exe (standalone exe) — retained for reference
  shrinkled: number;    // exemusic.exe
  binBytes: number;     // a.mingw.bin — the relocatable code blob (the estimator target)
}

const HEADER = 'id,measured,producerCount,importBytes,uncompressed,shrinkled,binBytes';

export function toCsv(rows: MeasurementRow[]): string {
  const body = rows.map((r) =>
    [r.id, JSON.stringify(JSON.stringify(r.measured)), r.producerCount, r.importBytes, r.uncompressed, r.shrinkled, r.binBytes].join(','),
  );
  return [HEADER, ...body].join('\n') + '\n';
}

export function parseCsv(csv: string): MeasurementRow[] {
  const lines = csv.trim().split('\n');
  return lines.slice(1).map((line) => {
    const firstComma = line.indexOf(',');
    const id = line.slice(0, firstComma);
    const rest = line.slice(firstComma + 1);
    const m = /^("(?:[^"\\]|\\.)*"),(\d+),(\d+),(\d+),(\d+),(\d+)$/.exec(rest);
    if (!m) throw new Error(`bad csv row: ${line}`);
    const measured = JSON.parse(JSON.parse(m[1]!)) as PhaseDesc[];
    return {
      id, measured,
      producerCount: Number(m[2]), importBytes: Number(m[3]),
      uncompressed: Number(m[4]), shrinkled: Number(m[5]), binBytes: Number(m[6]),
    };
  });
}
