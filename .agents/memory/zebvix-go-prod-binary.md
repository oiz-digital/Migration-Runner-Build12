---
name: Zebvix Go service production binary
description: Go binary compiled on NixOS fails in production with "no such file or directory" — must use CGO_ENABLED=0 for static linking
---

## Rule

Always build the Go service binary with `CGO_ENABLED=0 go build -ldflags='-s -w' -o server .`

**Why:** Nix's Go toolchain produces dynamically linked ELF binaries by default. The ELF interpreter path points into `/nix/store/...` which doesn't exist in Replit's production Cloud Run container. When the container tries to exec the binary, the kernel returns `ENOENT` (no such file or directory) for the missing interpreter — Go's `os/exec` surfaces this as `fork/exec ./artifacts/go-service/server: no such file or directory` even though the binary file itself IS present.

**How to apply:** The fix is permanent in `artifacts/go-service/.replit-artifact/artifact.toml`:
```toml
[services.production.build]
args = ["sh", "-c", "cd artifacts/go-service && CGO_ENABLED=0 go build -ldflags='-s -w' -o server ."]
```
Any time the Go service is rebuilt locally (for a new committed binary), use the same flag.

**Verify:** `file artifacts/go-service/server` must say `statically linked`. If it says `dynamically linked`, the build was done without `CGO_ENABLED=0`.
