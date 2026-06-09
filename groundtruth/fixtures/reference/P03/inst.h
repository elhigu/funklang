// modes
if (instrument == 0) {
v1 = osc_saw(0, 700, 33);
v2 = osc_saw(1, v1, v1);
v3 = osc_pulse(2, 100, 12, v2);
}
