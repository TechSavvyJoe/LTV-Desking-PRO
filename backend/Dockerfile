# Pin the base and verify every downloaded release artifact. Remote ADD without
# a digest previously made Fly builds trust mutable upstream bytes.
ARG ALPINE_VERSION=3.24.1
FROM alpine:${ALPINE_VERSION} AS build

ARG PB_VERSION=0.39.6
ARG PB_SHA256=9251d4ebca4fe91771392dc389a6e449e4e00a34182b0316e7a2d9984d34da3d
ARG LITESTREAM_VERSION=0.5.14
ARG LITESTREAM_SHA256=32083dd2af13840b273c538360b828368d7b82bbaa2c641106052dc7814ed956

# Download and extract PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN echo "${PB_SHA256}  /tmp/pb.zip" | sha256sum -c - \
    && unzip /tmp/pb.zip -d /pb/

# Download Litestream for continuous WAL replication to R2. Runtime startup is
# fail-closed when backup settings are missing; plain PB requires ALLOW_NO_BACKUP=1.
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz /tmp/litestream.tar.gz
RUN echo "${LITESTREAM_SHA256}  /tmp/litestream.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/litestream.tar.gz -C /pb/

# Runtime stage
FROM alpine:${ALPINE_VERSION}

# Install ca-certificates for HTTPS
RUN apk add --no-cache ca-certificates

# Copy PocketBase + Litestream binaries
COPY --from=build /pb/pocketbase /pb/pocketbase
COPY --from=build /pb/litestream /pb/litestream

# Copy migrations and hooks. PocketBase loads JS hooks on boot from --hooksDir.
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks

# Copy Litestream config + start wrapper
COPY litestream.yml /pb/litestream.yml
COPY start.sh /pb/start.sh
RUN chmod +x /pb/start.sh

# Expose ports
EXPOSE 8080

# Create data directory (volume mount target)
RUN mkdir -p /pb/pb_data

# Boot PocketBase under Litestream; unprotected plain mode requires an explicit override.
CMD ["/pb/start.sh"]
