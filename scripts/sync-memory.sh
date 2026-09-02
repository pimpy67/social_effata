#!/bin/bash
# Sincronizza la cartella memory dal repo alla cartella privata di Claude Code

REPO_DIR="/Users/user/Documents/CORSO_ITS/EFFATA/social_effata"
PRIVATE_MEMORY="/Users/user/.claude/projects/-Users-user-Documents-CORSO-ITS-EFFATA-social-effata/memory"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sincronizzazione memory in corso..."

# Copia i file dalla cartella del repo a quella privata
cp -r "$REPO_DIR/memory/"* "$PRIVATE_MEMORY/" 2>/dev/null

# Copia i file nuovi dalla cartella privata al repo
cp -r "$PRIVATE_MEMORY/"* "$REPO_DIR/memory/" 2>/dev/null

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Memory sincronizzata"
