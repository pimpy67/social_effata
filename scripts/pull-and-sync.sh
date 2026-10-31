#!/bin/bash

# Script per avviare automaticamente il bot Telegram Effata
# Configurato in: ~/Library/LaunchAgents/com.social-effata.sync.plist
# PROTEZIONE: Preserva state.json durante gli aggiornamenti

set -e

# Directory del progetto
PROJECT_DIR="/Users/user/Documents/CORSO_ITS/EFFATA/social_effata"
LOG_FILE="$HOME/Library/Logs/social_effata_bot.log"
STATE_FILE="$PROJECT_DIR/state/state.json"
STATE_BACKUP="$PROJECT_DIR/state/state.json.backup"

# Crea la cartella dei log se non esiste
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$PROJECT_DIR/state"

{
  echo "[$(date)] Avvio del bot Effata..."

  # Vai alla directory del progetto
  cd "$PROJECT_DIR"

  # BACKUP dello stato prima di aggiornare
  if [ -f "$STATE_FILE" ]; then
    echo "[$(date)] Backup dello stato in corso..."
    cp "$STATE_FILE" "$STATE_BACKUP"
  fi

  # Aggiorna il codice
  echo "[$(date)] Aggiornamento del codice da Git..."
  git pull origin main 2>&1 || echo "[$(date)] Attenzione: git pull fallito, continuiamo comunque"

  # Installa dipendenze se package-lock.json è cambiato
  if [ "$?" -eq 0 ]; then
    npm ci --silent 2>&1 || npm install --silent 2>&1
  fi

  # Uccidi eventuali istanze precedenti del bot
  pkill -f "node src/index.js" || true
  sleep 1

  # RIPRISTINO dello stato dal backup
  if [ -f "$STATE_BACKUP" ]; then
    echo "[$(date)] Ripristino dello stato..."
    cp "$STATE_BACKUP" "$STATE_FILE"
  fi

  # Avvia il bot in background
  echo "[$(date)] Avvio del bot..."
  nohup npm start >> "$LOG_FILE" 2>&1 &

  echo "[$(date)] Bot avviato (PID: $!)"

} >> "$LOG_FILE" 2>&1

exit 0
