DIST_DIR ?= dist
VERSION := $(shell node -p "require('./package.json').version")
ZIP_NAME ?= pagesnap-$(VERSION).zip

.PHONY: build zip clean

build:
	pnpm -s run build

zip: build
	rm -f "$(ZIP_NAME)"
	cd "$(DIST_DIR)" && zip -qr "../$(ZIP_NAME)" .

clean:
	rm -f "$(ZIP_NAME)"
