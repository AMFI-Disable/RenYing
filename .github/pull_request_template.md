## Summary Of Changes

Provide a concise overview of the problem solved and the modifications made.

## Type Of Change

- [ ] Bug fix (`fix: ...`)
- [ ] New feature (`feat: ...`)
- [ ] Documentation update (`docs: ...`)
- [ ] CI/CD pipeline enhancement (`ci: ...`)
- [ ] Code refactoring (`refactor: ...`)
- [ ] Performance optimization (`perf: ...`)

## Pre-Flight Verification Checklist

- [ ] **Strict Commit Message**: Does every commit match `xxx: xxx xxx xxx` (prefix + exactly 3 lowercase words)?
- [ ] **Lowercase Tracked Files**: Are all added or modified files strictly lowercase?
- [ ] **Title Case Headers**: Are all markdown headings formatted in Title Case?
- [ ] **No Direct Binary Links**: Are all README and doc files free of direct `.dmg`/`.zip` download links?
- [ ] **Generated Pages Rebuilt**: Does `python3 tools/build.py --check` pass?
- [ ] **Docs In Sync**: If behaviour changed, are both readmes, the wiki (and `docs/wiki/`) and `docs/history/changelog.md` updated?
- [ ] **Unit Tests Passed**: Have all unit tests passed with zero failures?
