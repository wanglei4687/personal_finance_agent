FROM node:25-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm mastra

COPY package.json pnpm-lock.yaml tsconfig.json .npmrc ./
RUN pnpm install --frozen-lockfile

COPY src ./src

# RUN mastra build --studio


# FROM node:25-alpine AS runner

# WORKDIR /app

# ENV NODE_ENV=production
# ENV PORT=4111
# ENV MASTRA_HOST=0.0.0.0

# RUN npm install -g pnpm

# COPY --from=builder /app/.mastra/output/package.json ./package.json
# COPY --from=builder /app/.mastra/output/.npmrc ./.npmrc

# RUN pnpm install --prod --frozen-lockfile=false

# COPY --from=builder /app/.mastra/output ./

# EXPOSE 4111

# CMD ["node", "index.mjs"]
