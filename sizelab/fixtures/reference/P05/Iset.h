#define executable
#define numinstruments 1
const void * protrackermod;
INCBIN(protrackermod, "empty.mod");
const void * importedsamples;
INCBIN(importedsamples, "Isamp.raw");
int mod_length_empty = 2108;
int imp_length = 96;
long gen_length = 4000;
