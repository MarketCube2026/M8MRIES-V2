FROM node:22.14.0-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY server ./server
COPY src/rules.ts ./src/rules.ts
COPY shared ./shared
COPY rules ./rules
COPY scripts ./scripts
RUN chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s CMD node -e "fetch('http://127.0.0.1:4000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm","run","start"]
