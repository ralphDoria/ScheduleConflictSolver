.PHONY: build clean

# Extract extension name and version from manifest.json
EXT_NAME = $(shell grep -o '"name": "[^"]*' manifest.json | cut -d'"' -f4)
VERSION = $(shell grep -o '"version": "[^"]*' manifest.json | cut -d'"' -f4)
ZIP_NAME = $(EXT_NAME)-$(VERSION).zip
BUILD_DIR = builds
ZIP_PATH = $(BUILD_DIR)/$(ZIP_NAME)

build:
	@mkdir -p $(BUILD_DIR)
	@echo "Building $(ZIP_NAME)..."
	@cd . && zip -r $(ZIP_PATH) html-files images popup scripts manifest.json -q
	@echo "✓ Created $(ZIP_PATH)"

clean:
	@rm -rf $(BUILD_DIR)
	@echo "Cleaned builds directory"

.DEFAULT_GOAL := build
