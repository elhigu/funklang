# exe_creator toolchain notes (for sizelab builds + the GUI)

`exe_creator/` is **gitignored** (the original aklang tool, kept local), so the
fix below is **not** tracked in the repo — it must be (re)applied to the local
`exe_creator/` if that dir is ever re-extracted from the original zip.

## Required fix: link `gcc8_a_support` (provides `__mulsi3` etc.)

The stock `Makefile-executable` and `Makefile-binary` build with `-nostdlib`
and do **not** assemble/link `support/gcc8_a_support.s`. Any patch that emits a
32-bit multiply or divide (e.g. `enva`/`envd` with a variable rate, `distortion`
with a variable gain, and many real instruments) then fails to link with
`undefined reference to '__mulsi3'`. `gcc8_a_support.s` already exists and
defines `__mulsi3`/`__udivsi3`/`__divsi3`/`__modsi3`.

**Applied to both Makefiles** (in `exe_creator/`):

1. Add `obj/gcc8_a_support.o` to the `$(OUT).elf` prerequisites and the link command.
2. Add the assemble rule:
   ```make
   obj/gcc8_a_support.o: support/gcc8_a_support.s
   	$(info Assembling $<)
   	@$(CC) $(CCFLAGS) $(ASFLAGS) -xassembler-with-cpp -c -o $@ $(CURDIR)/$<
   ```
   (`Makefile-executable` already had these lines commented out; `Makefile-binary`
   needed them added.)

## Effect

- Real patches (exe **and** bin) link and build; the GUI's own "Export Amiga
  Exe/Bin" works (when run under a 64-bit-capable wine — see note below).

### Binary target: `--gc-sections` (pay only for what you use)

`Makefile-binary` *also* adds `-ffunction-sections -fdata-sections` +
`-Wl,--gc-sections`, so `gcc8_a_support` is **dropped when unreferenced**. A
patch with no 32-bit multiply (oscillators/filters/const params) carries none of
it; an envelope/distortion/clone patch pulls it in. Measured:
- empty patch bin: 496 → **236** bytes; P01 (osc_saw): 612 → **344**;
  "amigaklang basics" (envelopes): **5256** (unchanged — it needs `__mulsi3`).

The **exe** target (`Makefile-executable`) keeps the support force-linked (the
+420-byte bump is noise against the ~13.6 kB player, and the calibration corpus
was measured that way). The `compile.smoke` anchors: exe 13596/4544, bin **344**.

### GUI note

The GUI must run under a **64-bit-capable wine** (wineWow, win64 prefix) for its
spawned build to run the x86-64 toolchain. The stock `run.sh` uses 32-bit wine,
so the GUI's own Export buttons fail with "Bad EXE format" before compiling —
use the CLI (`npm run export:bin`) or relaunch the GUI under wineWow.
