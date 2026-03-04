FROM --platform=amd64 rust:alpine AS backend
WORKDIR /home/rust/src
RUN apk --no-cache add musl-dev

# Cache dependencies — only invalidated when Cargo.toml/Cargo.lock change
COPY Cargo.toml Cargo.lock ./
COPY examiner-server/Cargo.toml examiner-server/Cargo.toml
COPY examiner-wasm/Cargo.toml examiner-wasm/Cargo.toml
RUN mkdir -p examiner-server/src examiner-wasm/src \
    && echo "fn main() {}" > examiner-server/src/main.rs \
    && touch examiner-server/src/lib.rs \
    && touch examiner-wasm/src/lib.rs \
    && cargo build --release --package examiner-server \
    && rm -rf examiner-server/src examiner-wasm/src

# Build actual source — touch ensures mtimes are newer than cached artifacts
COPY . .
RUN touch examiner-server/src/main.rs examiner-server/src/lib.rs && \
    cargo build --release --package examiner-server

FROM --platform=amd64 rust:alpine AS wasm
WORKDIR /home/rust/src
RUN apk --no-cache add curl musl-dev
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
COPY . .
RUN wasm-pack build examiner-wasm

FROM --platform=amd64 node:lts-alpine AS frontend
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
COPY --from=wasm /home/rust/src/examiner-wasm/pkg examiner-wasm/pkg
RUN npm ci
COPY . .
ARG GITHUB_SHA
ENV VITE_SHA=${GITHUB_SHA}
RUN npm run check
RUN npm run build

FROM alpine:latest
RUN adduser -D -u 1000 appuser
WORKDIR /app
COPY --from=frontend /usr/src/app/dist dist
COPY --from=backend /home/rust/src/target/release/examiner-server .
RUN ldd examiner-server 2>&1 || true && \
    wc -c < examiner-server
USER appuser
CMD [ "./examiner-server" ]
