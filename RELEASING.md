# Releasing Triad

Triad uses `electron-updater` with a generic public feed. The feed is the
`latest` GitHub Release, so an installed launcher can check:

`https://github.com/<owner>/<repo>/releases/latest/download/latest.yml`

## One-time repository setup

1. Create a **public** GitHub repository for Triad.
2. From the project folder, connect it and push:

   ```bash
   git init
   git add .
   git commit -m "Initial Triad source"
   git branch -M main
   git remote add origin https://github.com/<owner>/<repo>.git
   git push -u origin main
   ```

3. In GitHub, open **Settings → Actions → General** and allow GitHub Actions
   to run (the default read/write workflow permission is enough; the workflow
   also asks for `contents: write`).

The release workflow discovers the feed URL from `GITHUB_REPOSITORY`; it does
not need a hard-coded owner in the source.

## Windows code signing

The release workflow requires a Windows Authenticode certificate before it
will build. It signs the app executable and the NSIS installer, then verifies
both signatures before publishing anything. Without valid secrets the workflow
fails early instead of shipping an unsigned release.

1. Obtain a Windows code-signing certificate with an exportable private key
   (`.pfx`/`.p12`). A standard OV or exportable EV certificate works. If your
   EV certificate lives on a hardware token or cloud HSM, this PFX-based
   workflow cannot use it; use a cloud signing service instead.
2. Base64-encode the PFX **without line breaks**. On macOS/Linux:

   ```bash
   base64 < triad-codesign.pfx | tr -d '\n' > csc-link.txt
   ```

   On Windows PowerShell:

   ```powershell
   [IO.File]::WriteAllText("csc-link.txt", [Convert]::ToBase64String([IO.File]::ReadAllBytes("triad-codesign.pfx")))
   ```

3. Add two **repository secrets** in GitHub → Settings → Secrets and variables
   → Actions:
   - `CSC_LINK`: the contents of `csc-link.txt`
   - `CSC_KEY_PASSWORD`: the PFX password

   Or use the GitHub CLI:

   ```bash
   gh secret set CSC_LINK < csc-link.txt
   gh secret set CSC_KEY_PASSWORD
   ```

   Never commit the PFX, password, or base64 file. The repository `.gitignore`
   excludes `*.pfx`, `*.p12`, and `csc-link.txt`.

The build uses SHA-256 signatures with an RFC 3161 timestamp. You can verify a
local artifact with:

```powershell
Get-AuthenticodeSignature -LiteralPath release/Triad-Setup-1.0.1.exe | Format-List Status,SignerCertificate,TimeStamperCertificate
```

Signing removes the “unknown publisher” problem once Windows trusts the
certificate. SmartScreen reputation is separate: a brand-new OV certificate can
still trigger warnings until reputation accumulates. EV certificates and
Microsoft Trusted Signing generally establish reputation faster. This workflow
cannot guarantee an immediate SmartScreen reputation for a new certificate.

## Publishing an update

1. Update `version` in `package.json` and add matching release notes under
   `src/shared/releaseNotes.json`.
2. Publish with `send.bat` (below), or commit and push a matching tag to use
   the **Release Triad** GitHub Actions workflow:

   ```bash
   git add .
   git commit -m "Release 1.0.2"
   git tag v1.0.2
   git push origin main
   git push origin v1.0.2
   ```

   The workflow type-checks, builds and signs the NSIS installer, verifies its
   Authenticode signature, writes `latest.yml`, and publishes the installer,
   blockmap and manifest to the GitHub Release.

## Sending an update with send.bat

`send.bat` is a local publisher for Windows. It needs Node.js, a **public**
GitHub repository and the GitHub CLI signed in with `gh auth login`.

Before running it, bump `version` in `package.json` and add an entry for that
same version to `src/shared/releaseNotes.json`. The launcher compares versions,
so publishing the same version again does not reach installed users.

Double-click `send.bat`, or run it with the link or local path and repository:

```bat
send.bat "https://example.com/Triad-Setup-1.0.2.exe" "owner/repo"
send.bat "release\Triad-Setup-1.0.2.exe" "owner/repo"
```

- **With an installer link:** the installer stays at that public HTTPS link.
  `send.bat` downloads it once to validate it and calculate its SHA-512, then
  publishes only `latest.yml` and the patch notes to the latest GitHub release.
- **With a local installer path:** `send.bat` validates the file, publishes
  `latest.yml` and the patch notes, and uploads the installer with
  `gh release upload`. GitHub release assets can be up to **2 GiB per file**.
  The 25 MiB limit on GitHub's website applies to repository file uploads, not
  to release assets uploaded by `gh`, so a 100+ MB installer is fine.
- **With a blank link:** `send.bat` configures the feed for the repository,
  runs `build.bat`, and publishes the freshly built installer, manifest and
  patch notes. This is the easiest path when building on this machine.
- **Feed setup:** `send.bat` writes
  `https://github.com/<owner>/<repo>/releases/latest/download` to
  `resources/update-feed.json`. An installer built **before** that feed was
  configured will not find updates, so rebuild it after changing the feed.
  This applies to a local installer path too; use a build made with the same
  feed.
- **Large installers:** a small host limit (for example 25 MB per file) cannot
  hold the full Electron installer. Use GitHub Releases by passing a local
  path, or host the installer somewhere that allows the full file size. Do not
  split the installer: the updater expects one downloadable NSIS `.exe`.
- **Patch notes:** the same text is written to `latest.yml` and included in the
  installer's `releaseNotes.json`. After updating and restarting, the user sees
  it once in the launcher's What's New screen.
- **What users see:** an available update appears as an **Update** banner.
  Pressing it downloads the build; when ready the banner offers **Restart &
  update**. Patch notes appear automatically after the restart.

A published update is picked up on the launcher's next check (at startup, or
hourly while open). There is no instant push to a running launcher; the update
feed is the delivery mechanism.

Local builds use an empty feed and report updates as unavailable. To build a
publishable release locally outside `send.bat`, set the feed URL first; set
`CSC_LINK` and `CSC_KEY_PASSWORD` as well if you want that local build signed:

```bash
TRIAD_UPDATE_URL=https://github.com/<owner>/<repo>/releases/latest/download npm run release
```

## Notes

- Existing `1.0.0` builds do not contain the updater, and early `1.0.1`
  builds have an empty feed. Those users need to install the first
  feed-enabled release once manually; later releases are automatic.
- Release builds from the GitHub Actions workflow require `CSC_LINK` and
  `CSC_KEY_PASSWORD`; the workflow verifies the app and installer signatures
  before publishing. `send.bat` itself does not sign (`build.bat` signs only
  when those environment variables are present).
- The update check runs at startup and once an hour while Triad is open.
- The build deliberately downloads the full installer rather than relying on
  a previous release's blockmap from the `latest` URL. The blockmap is still
  uploaded so a future delta implementation can use it.
- Do not put a GitHub token in the source. The release workflow uses the
  repository-scoped `GITHUB_TOKEN`.
