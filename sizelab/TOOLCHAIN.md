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
  Exe/Bin" works too.
- Adds a fixed overhead to **every** build (the whole support object is linked,
  not garbage-collected): P01 exe 13176 → **13596** uncompressed (4388 → **4544**
  shrinklered), bin 344 → **612**. This is a constant base bump — per-op/per-mode
  costs are unchanged.
- The calibration corpus (`corpus/measurements.csv`) and the `compile.smoke`
  anchors were re-measured **with** this fix in place; they assume it.
