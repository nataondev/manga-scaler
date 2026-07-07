#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}      MANGA-SCALER INSTALLER        ${NC}"
echo -e "${BLUE}=====================================${NC}"

mkdir -p komik

# 1. Bun
echo -e "\n${YELLOW}[1/3] Memeriksa Bun...${NC}"
if command -v bun &> /dev/null; then
    echo -e "${GREEN}✓ Bun terinstall ($(bun --version))${NC}"
else
    echo -e "${YELLOW}⚠ Bun belum terinstall. Install: curl -fsSL https://bun.sh/install | bash${NC}"
    exit 1
fi

# 2. waifu2x
echo -e "\n${YELLOW}[2/3] Memeriksa waifu2x...${NC}"
echo -e "${YELLOW}waifu2x-ncnn-vulkan harus diinstall manual.${NC}"
echo -e "Download: https://github.com/nihui/waifu2x-ncnn-vulkan/releases/latest"
echo -e "Set WAIFU2X_PATH di .env ke lokasi binary waifu2x-ncnn-vulkan"

# 3. Dependencies
echo -e "\n${YELLOW}[3/3] Install dependensi...${NC}"
bun install

# .env
if [ ! -f ".env" ]; then
    cp env.example .env
    echo -e "${YELLOW}File .env dibuat dari template. Edit WAIFU2X_PATH sesuai lokasi waifu2x Anda.${NC}"
fi

echo -e "\n${GREEN}=====================================${NC}"
echo -e "${GREEN}      INSTALASI SELESAI!            ${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "\n${BLUE}Gunakan:${NC}"
echo -e "  ${GREEN}bun serve${NC}   → Web viewer di http://localhost:5000"
echo -e "  ${GREEN}bun scrap${NC}   → Scraping komik dari komiku.org"
echo -e "  ${GREEN}bun scrap_berwarna.ts${NC} → Scraping One Piece berwarna"
