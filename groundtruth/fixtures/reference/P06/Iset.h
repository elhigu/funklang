#define executable
#define numinstruments 3
const void * protrackermod;
INCBIN(protrackermod, "empty.mod");
const void * importedsamples;
INCBIN(importedsamples, "Isamp.raw");
int mod_length_empty = 2108;
int imp_length = 0;
long gen_length = 15000;
