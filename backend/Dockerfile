# Build stage
FROM alpine:latest AS build

ARG PB_VERSION=0.26.5
ARG LITESTREAM_VERSION=0.3.13

# Download and extract PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/

# Download Litestream for continuous WAL replication to R2. If LITESTREAM_*
# secrets aren't set at runtime, start.sh skips litestream and runs PB directly.
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -xzf /tmp/litestream.tar.gz -C /pb/

# Runtime stage
FROM alpine:latest

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

# Boot PocketBase under Litestream (or plain if R2 secrets aren't set)
CMD ["/pb/start.sh"]
