// op1
if (instrument == 0) {
v1 = osc_saw(0, 500, 40);
v1 = vol(v1, 50);
}
// op2
if (instrument == 1) {
v1 = osc_saw(0, 500, 40);
v1 = osc_saw(1, 300, 50);
}
// op3
if (instrument == 2) {
v1 = osc_saw(0, 500, 40);
v1 = osc_tri(1, 300, 50);
}
// op4
if (instrument == 3) {
v1 = osc_saw(0, 500, 40);
v1 = osc_sine(1, 300, 50);
}
// op5
if (instrument == 4) {
v1 = osc_saw(0, 500, 40);
v1 = osc_pulse(1, 300, 50, 20);
}
// op6
if (instrument == 5) {
v1 = osc_saw(0, 500, 40);
v1 = osc_noise(smp, 50);
}
// op7
if (instrument == 6) {
v1 = osc_saw(0, 500, 40);
v1 = enva(smp, v1, 0, 50);
}
// op8
if (instrument == 7) {
v1 = osc_saw(0, 500, 40);
v1 = envd(smp, v1, 7, 50);
}
// op9
if (instrument == 8) {
v1 = osc_saw(0, 500, 40);
v1 = add(v1, 7);
}
// op10
if (instrument == 9) {
v1 = osc_saw(0, 500, 40);
v1 = mul(v1, 7);
}
// op11
if (instrument == 10) {
v1 = osc_saw(0, 500, 40);
v1 = dly_cyc(1, v1, 300, 50);
}
// op12
if (instrument == 11) {
v1 = osc_saw(0, 500, 40);
v1 = cmb_flt_n(1, v1, 300, 7, 50);
}
// op13
if (instrument == 12) {
v1 = osc_saw(0, 500, 40);
v1 = reverb(v1, 7, 50);
}
// op14
if (instrument == 13) {
v1 = osc_saw(0, 500, 40);
v1 = ctrl(v1);
}
// op15
if (instrument == 14) {
v1 = osc_saw(0, 500, 40);
v1 = sv_flt_n(1, v1, 300, 7, 0);
}
// op16
if (instrument == 15) {
v1 = osc_saw(0, 500, 40);
v1 = distortion(v1, 50);
}
// op18
if (instrument == 16) {
v1 = osc_saw(0, 500, 40);
v1 = chordgen(smp, BaseAdr[0], 0, 0, 1, 7);
}
// op19
if (instrument == 17) {
v1 = osc_saw(0, 500, 40);
v1 = sh(1, v1, 50);
}
// op21
if (instrument == 18) {
v1 = osc_saw(0, 500, 40);
v1 = onepole_flt(1, v1, 300, 0);
}
