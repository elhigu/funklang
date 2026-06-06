// imports
if (instrument == 0) {
v1 = (smp < ImpLength[0] ? *(BYTE*)(BaseImpAdr[0]+smp)<<8 : 0);
v2 = (smp < ImpLength[1] ? *(BYTE*)(BaseImpAdr[1]+smp)<<8 : 0);
}
