# Security Policy

## Supported Versions

Only the version currently served at <https://amfi-disable.github.io/RenYing/> and the latest `renying-offline.html` on `main` get fixes.

| Version | Supported |
| :--- | :--- |
| Latest on `main` (1.0.x) | :white_check_mark: |
| Older builds and old cached pages | :x: |

## What Is In Scope

- The game page (`index.html`) and the offline edition (`renying-offline.html`).
- The Cloudflare Worker in `cloudflare/`: accounts, sign-in, cloud saves, the armory economy and market, leaderboards, the open world, and the admin page.
- Anything that lets one player read or change another player's account, items, or Ink.

Out of scope: balance problems, cosmetic bugs, and attacks that need someone else's unlocked device. Report those as normal [issues](https://github.com/AMFI-Disable/RenYing/issues).

## Reporting A Vulnerability

The project team takes security seriously. If you discover a vulnerability or security defect, please do **not** disclose it publicly via issues, discussions, or pull requests.

### Preferred Reporting Channels

1. Go to the **Security** tab on GitHub and click **Report a vulnerability** to open a private advisory.
2. Alternatively, email the maintainer directly at [evengao6688@gmail.com](mailto:evengao6688@gmail.com).

### Report Contents

Please include:

- A clear description of the vulnerability and its potential impact.
- Step-by-step instructions or minimal proof of concept to reproduce the issue.
- Operating system, browser, GPU or driver version, and whether it was the online or offline edition.
- Do not attach credentials, private keys, or personal secrets in any report. Test only with your own accounts, and do not run load or denial-of-service tests against the live Worker.

### Response Timeline

- **Acknowledgement**: Within 48 hours of initial report submission.
- **Assessment**: Within 7 business days with triage classification and resolution plan.
- **Remediation**: Coordinated disclosure schedule upon release of a patched version on `main`.
