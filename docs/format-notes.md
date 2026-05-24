# .akp / .aki File Format Notes

Verified against the decompiled `AmigaKlangGUI.Form1` (ilspycmd) — specifically the
`toolStripMenuItemSavePatch_Click` writer (~line 4549) and the
`toolStripMenuItemLoadPatch_Click` reader (~line 4605) in `/tmp/form1.cs`.

All multi-byte fields are little-endian (.NET `BinaryReader`/`BinaryWriter` default).
Strings are written via `BinaryWriter.Write(string)` — that is, a 7-bit-encoded
length prefix (LEB128, 1 byte for lengths < 128) followed by the UTF-8 bytes.

## High-level structure (.akp — whole patch)

```
+----------------------------------------+
| MAGIC : Int32 = 47110815 (0x02CEDA9F)  |
+----------------------------------------+
| INSTRUMENTS : 31 entries               |
|   each = NAME (LEB128+UTF8)            |
|        + samplelength (Int32)          |
|        + 20 SLOTS                      |
+----------------------------------------+
| IMPORTED_SAMPLES : 8 entries  (opt.)   |  (only if stream.Position < stream.Length)
|   each = NAME (LEB128+UTF8)            |
|        + importedlength (Int32)        |
|        + importedlength bytes (UInt8)  |
+----------------------------------------+
```

Notes:
- Instrument count is **31** (fixed).
- Slot count per instrument is **20** (fixed).
- Imported sample count is **8** (not 9 — the save loop is `for (int k = 0; k < 8; k++)`).
- The imported-samples block is **optional** on load: the reader only consumes it if
  `stream.Position != stream.Length` after the 31 instruments. Saver always writes it.

## Slot layout — exact field order (62 bytes per slot)

This is the on-disk order as read by `toolStripMenuItemLoadPatch_Click`:

```
offset  size  type    field
------  ----  ------  -----------------------------
   +0     4   Int32   arrayvar          (outVar)
   +4     4   Int32   arrayfunction     (fn)
   +8     1   UInt8   arrayinstance
   +9     2   Int16   arrayfrequency
  +11     2   Int16   arrayfrequencyval
  +13     1   UInt8   arraygain
  +14     1   UInt8   arraygainval
  +15     1   UInt8   arraywidth
  +16     1   UInt8   arraywidthval
  +17     2   Int16   arrayval1
  +19     2   Int16   arrayval1value
  +21     2   Int16   arrayval2
  +23     2   Int16   arrayval2value
  +25     4   Int32   loopoffset        (per-instrument, re-written every slot)
  +29     4   Int32   looplength        (per-instrument, re-written every slot)
------  ----
  =33 bytes per slot
```

Important quirks:
- `arrayinstance` **is** on disk (UInt8) — at offset +8, right after `fn`.
- `arraygain`, `arraygainval` **are** on disk (UInt8 pair) — at +13/+14. The clone
  op must include them.
- `arraywidth`, `arraywidthval` **are** on disk (UInt8 pair) — at +15/+16.
- `loopoffset` and `looplength` are per-instrument scalars but the code writes/reads
  them **inside the slot loop**, so they appear 20 times per instrument. The last
  value written wins on load. Faithful reimplementations must preserve this layout.

Per-instrument size:
- name: 1+N bytes
- samplelength: 4 bytes
- 20 slots × 33 bytes = 660 bytes
- total (excluding name): 664 bytes

## Single-instrument file (.aki)

Same slot layout. Header differs:

```
MAGIC : Int32 = 47110816  (0x02CEDAA0)
samplelength : Int32
20 SLOTS (same 33-byte layout as above)
```

File size is asserted to be exactly **668 bytes** by the loader
(`new FileInfo(...).Length != 668`). That is: 4 (magic) + 4 (samplelength) +
20*33 (slots) = 668. No instrument name is stored in .aki — the name is taken
from the filename (without extension).
