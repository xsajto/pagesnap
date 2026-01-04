DIST_DIR ?= dist
ZIP_NAME ?= pagesnap.zip

.PHONY: build zip clean

build:
	pnpm -s run build

zip: build
	rm -f "$(ZIP_NAME)"
	cd "$(DIST_DIR)" && zip -qr "../$(ZIP_NAME)" .

clean:
	rm -f "$(ZIP_NAME)"
