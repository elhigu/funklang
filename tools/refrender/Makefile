CC      ?= gcc
CFLAGS  ?= -O2 -std=c11 -Wall -Wno-unused-function -Wno-unused-variable \
           -fno-builtin-abs -Wno-builtin-declaration-mismatch
TARGET  := refrender

$(TARGET): refrender.c ../../../exe_creator/synthnodes.h
	$(CC) $(CFLAGS) -o $@ refrender.c

clean:
	rm -f $(TARGET)
.PHONY: clean
