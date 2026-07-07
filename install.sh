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
echo -e "\n${YELLOW}[1/2] Memeriksa Bun...${NC}"
if command -v bun &> /dev/null; then
    echo -e "${GREEN}✓ Bun terinstall ($(bun --version))${NC}"
else
    echo -e "${YELLOW}⚠ Bun belum terinstall. Install: curl -fsSL https://bun.sh/install | bash${NC}"
    exit 1
fi

# 2. Dependencies
echo -e "\n${YELLOW}[2/2] Install dependensi...${NC}"
bun install

if [ ! -f ".env" ]; then
    cp env.example .env
fi

echo -e "\n${GREEN}=====================================${NC}"
echo -e "${GREEN}      INSTALASI SELESAI!            ${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "\n${BLUE}Gunakan:${NC}"
echo -e "  ${GREEN}bun serve${NC}   → Web viewer di http://localhost:5000"
echo -e "  ${GREEN}bun scrap${NC}   → Scraping komik"
