# Deploy the API on its own:
#   docker build -t rhythm-api ./backend
#   docker run --env-file backend/.env -e PORT=3002 -p 3002:3002 rhythm-api
# Production (NODE_ENV=production) requires JWT_SECRET and MONGODB_URI.
# Set CORS_ORIGIN and FRONTEND_URL to the frontend origin.
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

USER node
EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
