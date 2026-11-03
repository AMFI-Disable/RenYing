# Security Policy

## Supported Versions

Only the version currently served at <https://amfi-disable.github.io/RenYing/> and the latest `renying-offline.html` on `main` get fixes.

| Version | Supported |
| :--- | :--- |
| Latest on `main` (1.0.x) | :white_check_mark: |
| Older builds and old cached pages | :x: |

## What Is In Scope

- The game page (`index.html`) and the offline edition (`renying-offline.html`).
- The Cloudflare Worker in `cloudflare/`: accounts, sign-in, cloud saves, the armory economy and market, leaderboards, the open world and the admin page.
- Anything that lets one player read or change another player's account, items or Ink.

Out of scope: balance problems, cosmetic bugs, and attacks that need someone else's unlocked device. Report those as normal [issues](https://github.com/AMFI-Disable/RenYing/issues).

## Reporting A Vulnerability

Do **not** report security problems in public issues, discussions or pull requests.

1. Preferred: open the repository's **Security** tab and choose **Report a vulnerability** to send a private advisory.
2. Or email the maintainer at [evengao6688@gmail.com](mailto:evengao6688@gmail.com).

Please include:

- What the problem is and what someone could do with it.
- Steps to reproduce, or a minimal proof of concept.
- Browser, operating system, and whether it was the online or offline edition.

Never include passwords, tokens, private keys or other players' data in a report. Test only with your own accounts, and do not run load or denial-of-service tests against the live Worker.

## What Happens Next

- **Acknowledgement:** within 48 hours.
- **Assessment:** within 7 days, with a plan for a fix.
- **Fix:** released on `main`; the report is credited if you want it to be.
