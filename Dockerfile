# The upstream source is compiled by GitHub Actions. Only the packaged runtime
# (not the source code or build dependencies) is copied into this image.
FROM node:24.14.0-bookworm-slim

# Common tools the coding agent needs inside its isolated workspace.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git openssh-client curl ca-certificates python3 bash \
 && rm -rf /var/lib/apt/lists/*

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
