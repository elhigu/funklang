// Little-endian binary reader/writer compatible with .NET BinaryReader/Writer.
//
// Strings are .NET-style: 7-bit-encoded (LEB128) length prefix followed by UTF-8 bytes.
// See funklang/docs/format-notes.md.

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export class BinReader {
  readonly bytes: Uint8Array;
  /** Current read offset. */
  off: number;
  private readonly view: DataView;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.off = 0;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.length;
  }

  get eof(): boolean {
    return this.off >= this.bytes.length;
  }

  private need(n: number): number {
    if (this.off + n > this.bytes.length) {
      throw new RangeError(
        `unexpected EOF: needed ${n} bytes at offset ${this.off} (have ${
          this.bytes.length - this.off
        })`,
      );
    }
    const at = this.off;
    this.off += n;
    return at;
  }

  u8(): number {
    const at = this.need(1);
    return this.view.getUint8(at);
  }

  i8(): number {
    const at = this.need(1);
    return this.view.getInt8(at);
  }

  i16(): number {
    const at = this.need(2);
    return this.view.getInt16(at, true);
  }

  u16(): number {
    const at = this.need(2);
    return this.view.getUint16(at, true);
  }

  i32(): number {
    const at = this.need(4);
    return this.view.getInt32(at, true);
  }

  u32(): number {
    const at = this.need(4);
    return this.view.getUint32(at, true);
  }

  bytes_(n: number): Uint8Array {
    const at = this.need(n);
    // copy to avoid sharing the underlying buffer
    return this.bytes.slice(at, at + n);
  }

  /** .NET-style 7-bit length prefix + UTF-8 bytes. */
  cstr(): string {
    let len = 0;
    let shift = 0;
    while (true) {
      const b = this.u8();
      len |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) {
        throw new RangeError(`malformed 7-bit length prefix at offset ${this.off}`);
      }
    }
    const at = this.need(len);
    return UTF8_DECODER.decode(this.bytes.subarray(at, at + len));
  }
}

export class BinWriter {
  private chunks: Uint8Array[] = [];
  private len = 0;

  get length(): number {
    return this.len;
  }

  private push(buf: Uint8Array): void {
    this.chunks.push(buf);
    this.len += buf.length;
  }

  u8(v: number): void {
    const b = new Uint8Array(1);
    b[0] = v & 0xff;
    this.push(b);
  }

  i8(v: number): void {
    const b = new Uint8Array(1);
    new DataView(b.buffer).setInt8(0, v);
    this.push(b);
  }

  i16(v: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, v, true);
    this.push(b);
  }

  u16(v: number): void {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    this.push(b);
  }

  i32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, true);
    this.push(b);
  }

  u32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    this.push(b);
  }

  bytes_(buf: Uint8Array): void {
    // copy to detach
    this.push(new Uint8Array(buf));
  }

  /** .NET-style 7-bit length prefix + UTF-8 bytes. */
  cstr(s: string): void {
    const utf8 = UTF8_ENCODER.encode(s);
    let len = utf8.length;
    // LEB128
    const prefix: number[] = [];
    while (len >= 0x80) {
      prefix.push((len & 0x7f) | 0x80);
      len >>>= 7;
    }
    prefix.push(len & 0x7f);
    this.push(new Uint8Array(prefix));
    this.push(new Uint8Array(utf8));
  }

  toUint8(): Uint8Array {
    const out = new Uint8Array(this.len);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}
