# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copia package.json e package-lock.json
COPY package*.json ./

# Installa dipendenze
RUN npm ci --only=production

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Installa dumb-init per gestire i segnali
RUN apk add --no-cache dumb-init

# Copia le dipendenze dal builder
COPY --from=builder /app/node_modules ./node_modules

# Copia il codice sorgente
COPY . .

# Crea le directory necessarie
RUN mkdir -p intake output logs

# Esponi la porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => {if (res.statusCode !== 200) throw new Error(res.statusCode)})"

# Usa dumb-init per eseguire il processo
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Comando per avviare il bot
CMD ["node", "src/index.js"]
