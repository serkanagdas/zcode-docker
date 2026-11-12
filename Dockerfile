# The upstream source is compiled by GitHub Actions. Only the packaged runtime
# (not the source code or build dependencies) is copied into this image.

# Valkey 8 binaries (official image, same Debian bookworm base) for project dev/test services.
FROM valkey/valkey:8-bookworm AS valkey

FROM node:24.14.0-bookworm-slim

# Common tools the coding agent needs inside its isolated workspace.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssh-client curl ca-certificates python3 bash \
    gnupg build-essential jq unzip procps less \
 && rm -rf /var/lib/apt/lists/*

# PostgreSQL 17 server + client from the official PGDG repository.
# No default cluster is created: projects start their own cluster as the unprivileged user
# (e.g. scripts/dev-services.sh uses initdb/pg_ctl under the project directory).
RUN mkdir -p /etc/postgresql-common \
 && echo 'create_main_cluster = false' > /etc/postgresql-common/createcluster.conf \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo 'deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-17 postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/*

COPY --from=valkey /usr/local/bin/valkey-server /usr/local/bin/valkey-cli /usr/local/bin/

# pnpm (same pinned version as the CI build).
RUN npm install --global pnpm@10.33.2

ENV PATH="/usr/lib/postgresql/17/bin:${PATH}"

RUN groupadd --gid 10001 zcode \
 && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin zcode \
 && mkdir -p /opt/zcode /workspace /home/zcode/.zcode \
 && chown -R zcode:zcode /workspace /home/zcode

COPY --chown=10001:10001 image/runtime/zcode/ /opt/zcode/
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV HOME=/home/zcode \
    ZCODE_DATA_BASE_DIR=/home/zcode \
    NODE_ENV=production
WORKDIR /workspace
USER 10001:10001
EXPOSE 3030

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
