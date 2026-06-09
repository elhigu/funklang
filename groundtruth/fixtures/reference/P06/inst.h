// src
if (instrument == 0) {
v1 = osc_saw(0, 800, 50);
}
// clone
if (instrument == 1) {
v1 = ((((smp*(50+32768))>>15)+3)< SmpLength[0] ? *(BYTE*)(BaseAdr[0]+((smp*(50+32768))>>15)+3)<<8 : 0);
}
// chord
if (instrument == 2) {
v1 = chordgen(smp, BaseAdr[0], 1, 2, 3, 5);
}
