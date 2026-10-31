// Foto completa del estado de una partida para guardarla y seguirla después.
// Recorre el grafo de objetos (con referencias compartidas y ciclos), guarda Map, Set, arreglos tipados
// y clases registradas; al restaurar les devuelve su prototipo. Los objetos "externos" (datos fijos,
// como el guion de una historia) se guardan como una marca y se vuelven a enlazar al cargar.

type Ctor = { prototype: object; name: string };

export interface SnapshotOpts {
  classes: Record<string, Ctor>;
  /** campos que no se guardan (índices que se recalculan), por clase */
  skip?: Record<string, string[]>;
  externals?: Map<object, string>;
}

const TYPED: Record<string, { new (b: ArrayBuffer): ArrayBufferView }> = {
  Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array,
};

function toB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b: string): Uint8Array {
  const s = atob(b);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export function snapshot(root: unknown, opts: SnapshotOpts): string {
  const ids = new Map<object, number>();
  const protoName = new Map<object, string>();
  for (const [n, c] of Object.entries(opts.classes)) protoName.set(c.prototype, n);
  let next = 1;
  const enc = (v: unknown): unknown => {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
    if (v === undefined) return { $u: 1 };
    if (typeof v === 'function') throw new Error('No se puede guardar una función');
    const o = v as object;
    const ext = opts.externals?.get(o);
    if (ext) return { $x: ext };
    const seen = ids.get(o);
    if (seen) return { $r: seen };
    const id = next++;
    ids.set(o, id);
    if (ArrayBuffer.isView(o)) {
      const ta = o as unknown as { constructor: { name: string }; buffer: ArrayBuffer; byteOffset: number; byteLength: number };
      return { $id: id, $t: ta.constructor.name, d: toB64(new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength)) };
    }
    if (Array.isArray(o)) return { $id: id, $a: o.map(enc) };
    if (o instanceof Map) return { $id: id, $m: [...o].map(([k, x]) => [enc(k), enc(x)]) };
    if (o instanceof Set) return { $id: id, $s: [...o].map(enc) };
    const proto = Object.getPrototypeOf(o);
    const cls = proto === Object.prototype || proto === null ? undefined : protoName.get(proto);
    if (proto !== Object.prototype && proto !== null && !cls) throw new Error('Clase sin registrar: ' + (proto?.constructor?.name ?? '?'));
    const skip = cls ? opts.skip?.[cls] : undefined;
    const out: Record<string, unknown> = { $id: id };
    if (cls) out.$c = cls;
    const p: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      if (skip?.includes(k)) continue;
      const x = (o as Record<string, unknown>)[k];
      if (x === undefined) continue;
      p[k] = enc(x);
    }
    out.p = p;
    return out;
  };
  return JSON.stringify(enc(root));
}

export function restore<T>(json: string, opts: SnapshotOpts & { externalsById?: Record<string, object> }): T {
  const byId = new Map<number, unknown>();
  const dec = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    if ('$r' in o) { if (!byId.has(o.$r as number)) throw new Error('Referencia rota'); return byId.get(o.$r as number); }
    if ('$x' in o) return opts.externalsById?.[o.$x as string];
    if ('$n' in o) return Number(o.$n);
    if ('$u' in o) return undefined;
    const id = o.$id as number;
    if ('$t' in o) {
      const bytes = fromB64(o.d as string);
      const T = TYPED[o.$t as string];
      const ta = new T(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
      byId.set(id, ta); return ta;
    }
    if ('$a' in o) { const a: unknown[] = []; byId.set(id, a); for (const x of o.$a as unknown[]) a.push(dec(x)); return a; }
    if ('$m' in o) { const m = new Map(); byId.set(id, m); for (const [k, x] of o.$m as [unknown, unknown][]) m.set(dec(k), dec(x)); return m; }
    if ('$s' in o) { const s = new Set(); byId.set(id, s); for (const x of o.$s as unknown[]) s.add(dec(x)); return s; }
    const C = o.$c ? opts.classes[o.$c as string] : undefined;
    if (o.$c && !C) throw new Error('Clase desconocida: ' + o.$c);
    const obj: Record<string, unknown> = Object.create(C ? C.prototype : Object.prototype);
    byId.set(id, obj);
    const p = o.p as Record<string, unknown>;
    for (const k of Object.keys(p)) obj[k] = dec(p[k]);
    return obj;
  };
  return dec(JSON.parse(json)) as T;
}
