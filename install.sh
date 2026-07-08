#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${BLUE}${BOLD}=====================================${NC}"
echo -e "${BLUE}${BOLD}      MANGA-SCALER INSTALLER        ${NC}"
echo -e "${BLUE}${BOLD}=====================================${NC}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOOLS_DIR="$HOME/Repos/tools"
WAIFU2X_DIR="$TOOLS_DIR/waifu2x"
GITHUB_API="https://api.github.com/repos/nihui/waifu2x-ncnn-vulkan/releases/latest"

# ── OS detect ──
OS="$(uname -s)"
case "$OS" in
  Linux)   WAIFU2X_OS="linux" ;;
  Darwin)  WAIFU2X_OS="macos" ;;
  MINGW*|MSYS*|CYGWIN*) WAIFU2X_OS="windows" ;;
  *)       echo -e "${RED}Unsupported OS: $OS${NC}"; exit 1 ;;
esac

echo -e "\n${BLUE}Sistem:${NC} $OS → waifu2x-${WAIFU2X_OS}"

# ══════════════════════════════════════
# 1. Bun
# ══════════════════════════════════════
echo -e "\n${YELLOW}[1/4] Bun...${NC}"
if command -v bun &>/dev/null; then
  echo -e "${GREEN}✓ Bun $(bun --version)${NC}"
else
  echo -e "${YELLOW}Menginstall Bun...${NC}"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo -e "${GREEN}✓ Bun $(bun --version)${NC}"
fi

# ══════════════════════════════════════
# 2. waifu2x-ncnn-vulkan
# ══════════════════════════════════════
echo -e "\n${YELLOW}[2/4] waifu2x-ncnn-vulkan...${NC}"

# Cek dari .env dulu
if [ -f "$SCRIPT_DIR/.env" ]; then
  ENV_WAIFU2X=$(grep -E '^WAIFU2X_PATH=' "$SCRIPT_DIR/.env" | cut -d'=' -f2- | head -1)
  ENV_WAIFU2X="${ENV_WAIFU2X/#\~/$HOME}"
  if [ -n "$ENV_WAIFU2X" ] && [ -f "$ENV_WAIFU2X" ]; then
    echo -e "${GREEN}✓ waifu2x ditemukan dari .env: $ENV_WAIFU2X${NC}"
    WAIFU2X_BIN="$ENV_WAIFU2X"
    WAIFU2X_DIR="$(dirname "$WAIFU2X_BIN")"
  fi
fi

# Fallback default path
if [ -z "${WAIFU2X_BIN:-}" ]; then
  WAIFU2X_DIR="$TOOLS_DIR/waifu2x"
  WAIFU2X_BIN="$WAIFU2X_DIR/waifu2x-ncnn-vulkan"

  if [ -f "$WAIFU2X_BIN" ]; then
    echo -e "${GREEN}✓ waifu2x sudah ada di $WAIFU2X_DIR${NC}"
  fi
fi

if [ ! -f "$WAIFU2X_BIN" ]; then
  echo -e "${YELLOW}Fetching latest release info...${NC}"
  RELEASE_JSON=$(curl -fsSL "$GITHUB_API" 2>/dev/null)
  if [ -z "$RELEASE_JSON" ]; then
    echo -e "${RED}✗ Gagal fetch release dari GitHub${NC}"
    echo -e "${YELLOW}  Download manual: https://github.com/nihui/waifu2x-ncnn-vulkan/releases/latest${NC}"
    exit 1
  fi

  TAG=$(echo "$RELEASE_JSON" | grep -o '"tag_name": *"[^"]*"' | head -1 | cut -d'"' -f4)
  DL_URL=$(echo "$RELEASE_JSON" | grep -o "\"browser_download_url\": *\"[^\"]*${WAIFU2X_OS}[^\"]*\.zip\"" | head -1 | cut -d'"' -f4)

  if [ -z "$DL_URL" ]; then
    echo -e "${RED}✗ Gak nemu asset untuk OS $WAIFU2X_OS di release $TAG${NC}"
    exit 1
  fi

  echo -e "${YELLOW}Downloading waifu2x-ncnn-vulkan ($TAG - $WAIFU2X_OS)...${NC}"
  mkdir -p "$WAIFU2X_DIR"
  TMP_ZIP="$WAIFU2X_DIR/waifu2x-tmp.zip"

  if command -v wget &>/dev/null; then
    wget -q --show-progress -O "$TMP_ZIP" "$DL_URL"
  else
    curl -#Lo "$TMP_ZIP" "$DL_URL"
  fi

  echo -e "${YELLOW}Extracting...${NC}"
  if command -v unzip &>/dev/null; then
    unzip -qo "$TMP_ZIP" -d "$WAIFU2X_DIR"
  else
    echo -e "${RED}✗ unzip tidak ditemukan. Install dulu.${NC}"
    exit 1
  fi

  rm -f "$TMP_ZIP"

  if [ ! -f "$WAIFU2X_BIN" ]; then
    FOUND=$(find "$WAIFU2X_DIR" -name "waifu2x-ncnn-vulkan" -type f 2>/dev/null | head -1)
    if [ -n "$FOUND" ]; then
      mv "$FOUND" "$WAIFU2X_BIN" 2>/dev/null || true
      BIN_DIR="$(dirname "$FOUND")"
      find "$BIN_DIR" -maxdepth 1 -type f | while read f; do
        [ "$f" != "$WAIFU2X_BIN" ] && mv "$f" "$WAIFU2X_DIR/" 2>/dev/null || true
      done
      find "$WAIFU2X_DIR" -mindepth 1 -maxdepth 1 -type d -empty -delete 2>/dev/null || true
    fi
  fi

  chmod +x "$WAIFU2X_BIN" 2>/dev/null || true
  echo -e "${GREEN}✓ waifu2x-ncnn-vulkan terinstall di $WAIFU2X_DIR${NC}"
fi

# ══════════════════════════════════════
# 3. Dependencies
# ══════════════════════════════════════
echo -e "\n${YELLOW}[3/4] Install dependensi backend...${NC}"
cd "$SCRIPT_DIR"
bun install --silent 2>&1 | tail -1
echo -e "${GREEN}✓ Done${NC}"

# ══════════════════════════════════════
# 4. Frontend build
# ══════════════════════════════════════
echo -e "\n${YELLOW}[4/4] Build frontend...${NC}"
if [ -d "$SCRIPT_DIR/frontend" ]; then
  cd "$SCRIPT_DIR/frontend"
  bun install --silent 2>&1 | tail -1
  bun run build --logLevel warn 2>&1 | tail -3
  cd "$SCRIPT_DIR"
  echo -e "${GREEN}✓ Frontend build selesai${NC}"
else
  echo -e "${YELLOW}⚠ Folder frontend/ tidak ditemukan, skip build${NC}"
fi

# ══════════════════════════════════════
# .env setup
# ══════════════════════════════════════
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  cat > "$SCRIPT_DIR/.env" <<EOF
WEB_SERVER_PORT=5000
WAIFU2X_PATH=$WAIFU2X_DIR/waifu2x-ncnn-vulkan
MIN_IMAGE_WIDTH=950
WEBP_QUALITY=85
NOISE_REDUCTION=2
SCALE_FACTOR=2
EOF
  echo -e "${GREEN}✓ .env dibuat${NC}"
else
  echo -e "${BLUE}  .env sudah ada, skip${NC}"
fi

echo -e "\n${GREEN}${BOLD}=====================================${NC}"
echo -e "${GREEN}${BOLD}      INSTALASI SELESAI!            ${NC}"
echo -e "${GREEN}${BOLD}=====================================${NC}"
echo -e "\n${BLUE}Gunakan:${NC}"
echo -e "  ${GREEN}bun serve${NC}   → Web viewer di http://localhost:5000"
echo -e "  ${GREEN}bun scrap${NC}   → Scraping komik"
echo -e "\n${BLUE}waifu2x:${NC} $WAIFU2X_DIR/"
