# ZCode Docker — GitHub Actions + GHCR + Arcane

This repository **does not fork or modify ZCode**. GitHub Actions builds the official
`zai-org/ZCode` source from an exact upstream commit and publishes a Web/headless
Docker runtime image to GitHub Container Registry.

## One-time setup

1. Create a **public**, empty GitHub repository named `zcode-docker` (default branch `main`).
2. Upload these files, preserving `.github/workflows/zcode.yml` and the dotfiles.
3. Open **Actions → Build ZCode image → Run workflow**.
4. Watch the build. If it succeeds, look for package `zcode` on your profile.
5. Open package **Settings → Change package visibility → Public** to allow anonymous
   `docker pull` from edoor. GitHub Container Registry packages may initially be private
   even when the source repository is public.
6. Replace `YOUR_GITHUB_USERNAME` in `compose.yaml`, then deploy with Arcane on edoor.
7. Set `ZCODE_WEB_TOKEN` as an Arcane stack environment value or untracked `.env` file;
   `openssl rand -hex 32` generates an example strong token. **Never commit real tokens**.
8. Keep port `3030` on loopback and use Tailscale Serve or a protected reverse proxy
   for remote access; do not publish the port directly on the Internet.

## Updating

- Schedule: checks upstream every day at 01:23 UTC (04:23 Istanbul) and **only builds**
  if the exact upstream commit's image tag has not been published yet.
- Manual **Run workflow** or a push changing packaging files forces a rebuild.
- On build + Web smoke-test success, publishes `:latest`, `:vX.Y.Z` and `:sha-<12charsha>`.
- Existing edoor containers **do not update automatically**. In Arcane, pull/redeploy
  the new image after checking the build and upstream changes.
- For easy rollback, use a specific `:sha-...` image tag in the production compose file
  instead of `:latest`, and retain the previous tag.
- Public repository scheduled workflows can be disabled by GitHub after **60 days of
  inactivity**. Check the Actions tab periodically or add an external check.

## Caveats

- This is a **starter configuration, not a build-proven working image**. Upstream's
  `build:zcode` has at least one reported source build bug (issue #1069, opened 2026-10-17).
  If the first workflow fails, inspect the logs before deploying anything.
- ZCode Web is powerful and can execute code in its workspace. No Docker socket, host
  root filesystem, SSH keys or production project folders are mounted.
- The Docker image uses a non-root UID 10001. Add only the workspaces and credentials
  specifically needed; model keys and tokens belong in secrets/environment.
- The image is for `linux/amd64` (edoor); adjust if needed for arm64 in the future.
- The distribution's `--base-url` is an installer metadata placeholder and **is not**
  used for runtime image pulls.
- Public GitHub Actions standard hosted runner use is free. Build duration, upstream
  packages and runner resources can still cause CI failures.

Official source: https://github.com/zai-org/ZCode
Upstream README: https://github.com/zai-org/ZCode/blob/main/README.en.md
Build issue: https://github.com/zai-org/feedback/issues/1069
