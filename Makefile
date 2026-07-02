EXTENSION_NAME := tabfree
XPI_FILE := $(EXTENSION_NAME).xpi
RELEASE_TAR := $(EXTENSION_NAME)-complete.tar
EXT_FILES := manifest.json background.js
HOST_FILES := host.py fr.btmx.seticon.json install_host.sh icons/firefox-default.png

.PHONY: all xpi dist clean

all: xpi

xpi: $(EXT_FILES)
	rm -f $(XPI_FILE)
	zip -r $(XPI_FILE) $(EXT_FILES)

dist: xpi
	rm -f $(RELEASE_TAR)
	chmod +x host.py install_host.sh
	tar -cvf $(RELEASE_TAR) $(XPI_FILE) $(HOST_FILES)

clean:
	rm -f *.xpi *.tar

