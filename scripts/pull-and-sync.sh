#!/bin/bash
# Git pull e sincronizzazione memory - eseguito da launchd

REPO_DIR="/Users/user/Documents/CORSO_ITS/EFFATA/social_effata"
LOG_FILE="/Users/user/Library/Logs/social_effata_sync.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Inizio git pull e sync..." >> "$LOG_FILE"

cd "$REPO_DIR" || exit 1

# Git pull
git pull origin main >> "$LOG_FILE" 2>&1

# Sincronizzazione memory
"$REPO_DIR/scripts/sync-memory.sh" >> "$LOG_FILE" 2>&1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Completato" >> "$LOG_FILE"
