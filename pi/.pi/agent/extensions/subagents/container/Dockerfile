# Sandbox image for isolation: "container" subagents.
#
# Everything untrusted (a cloned repository, fetched web pages, a headless
# browser rendering them) lives in a container made from this image. The
# agent that reasons about it stays on the host; only its tools run here.
#
# Built locally by container-isolation.ts and tagged with a hash of this
# directory, so editing any file here rebuilds it on the next launch.
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ca-certificates git curl jq python3 \
      ripgrep fd-find file binutils xxd unzip p7zip-full \
      chromium fonts-dejavu-core \
 && ln -s /usr/bin/fdfind /usr/local/bin/fd \
 && rm -rf /var/lib/apt/lists/*

# Chromium otherwise calls Google for sign-in, component updates, network
# time, and metrics on every start. The policy turns those off, and removing
# Debian's Google API keys stops the services that need them.
COPY chromium-policy.json /etc/chromium/policies/managed/pi-sandbox.json
RUN rm -f /etc/chromium.d/apikeys

COPY bin/ /usr/local/bin/
RUN chmod 0755 /usr/local/bin/web-search /usr/local/bin/web-fetch \
      /usr/local/bin/web-shot /usr/local/bin/egress-proxy \
 && useradd --uid 10001 --create-home --shell /bin/bash sandbox \
 && mkdir -p /work && chown sandbox:sandbox /work

# Git must never run anything from the repository it reads.
RUN git config --system core.hooksPath /dev/null \
 && git config --system protocol.allow never \
 && git config --system protocol.https.allow always \
 && git config --system submodule.recurse false \
 && git config --system safe.directory '*'

USER sandbox
WORKDIR /work
ENV HOME=/home/sandbox LANG=C.UTF-8 GIT_TERMINAL_PROMPT=0
