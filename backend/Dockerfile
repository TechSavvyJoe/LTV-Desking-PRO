# Build stage
FROM alpine:latest AS build

ARG PB_VERSION=0.22.20

# Download and extract PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/

# Runtime stage
FROM alpine:latest

# Install ca-certificates for HTTPS
RUN apk add --no-cache ca-certificates

# Copy PocketBase binary
COPY --from=build /pb/pocketbase /pb/pocketbase

# Copy migrations and hooks
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks

# Expose ports
EXPOSE 8080

# Create data directory (will be mounted as volume on Fly.io)
RUN mkdir -p /pb/pb_data

# Run PocketBase
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations", "--hooksDir=/pb/pb_hooks"]
