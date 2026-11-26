# Platforms and releases

## Artifacts

The estimator preview is `v2.0.0-beta.2`. Download assets and `SHA256SUMS.txt` from GitHub Releases.

- Windows x64 ZIP: bundled native executable, start instructions, license, and export environments.
- Linux x64 portable tarball: bundled native executable and the same auxiliary files.
- Ubuntu x64 DEB: `/usr/bin/chaos-lab`, an application-menu entry, and license. The native launcher targets glibc 2.28 or newer; Ubuntu 22.04/24.04 are in the support target.
- EL9 x64 RPM: the same app and desktop integration, tested in Rocky Linux 9 before publication.
- Docker amd64 image archive: load with `docker load -i ...`; run without registry authentication. The Dockerfile can also build for other architectures supported by its Node base images; only x64/amd64 prebuilt release assets are included in this preview.

The Windows executable is unsigned. Browser-local model storage is separate from the installed package. Always export models before clearing browser data or switching host/port/browser.

## Verify downloads

Linux:

```sh
sha256sum -c SHA256SUMS.txt --ignore-missing
```

Windows PowerShell:

```powershell
Get-FileHash .\chaos-lab-2.0.0-beta.2-windows-x64.zip -Algorithm SHA256
```

Compare the hash with the corresponding line in `SHA256SUMS.txt`.

## Build native artifacts

Use Node.js 24 and build on the target OS/CPU. The packaging command creates a Node single-executable application with embedded static assets; end users do not need Node. Linux builds use the official Node binary's baseline, rather than linking against an EL-specific application runtime.

```sh
npm ci
npm run build
npm run check
npm run package
npm run test:binary
```

Linux DEB/RPM builders also need `dpkg-deb` and `rpmbuild`:

```sh
npm run package -- --linux-packages
```

The output directory is `releases/`. This preview has no native cross-compilation step: Windows packages are built and executed on Windows runners; Linux packages are built on Ubuntu runners. The release workflow then installs the RPM inside EL9 and starts it there.

## Release workflow

`.github/workflows/ci-release.yml` runs the following checks on pushes and pull requests:

1. Build, unit/integration tests, headless browser flows, and Python exports on Windows and Ubuntu.
2. Julia symbolic/analytic export checks and visualization output on Linux.
3. For main-branch pushes, a version tag, or a manual dry run: native Windows/Linux packaging, executable health checks, Ubuntu installation, EL9 installation, and Docker build/run tests.
4. Only for a matching `v<package.json version>` tag: collect the archives, generate combined SHA-256 checksums, and publish the GitHub release. A version containing `-` is published as a prerelease.

To create a later release:

```sh
npm version 2.0.0-beta.3 --no-git-tag-version
# Update release notes; build, test, and commit the source and lockfile.
git tag v2.0.0-beta.3
git push origin main v2.0.0-beta.3
```

The workflow needs the repository's standard GitHub Actions `contents: write` permission for its final publication job. No Docker registry secret is required because the image is distributed as a release archive.
