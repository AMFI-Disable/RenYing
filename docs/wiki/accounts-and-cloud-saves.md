# Accounts And Cloud Saves / 账号与云存档

## Three Ways To Play / 三种身份

| | Guest / 游客 | Local account / 本机账号 | Cloud account / 云端账号 |
| :--- | :--- | :--- | :--- |
| Where progress lives | This browser | This browser | The game's server, synced to every device |
| Armory | — | On this device, no player market | Full armory and player market |
| Ranked, leaderboards, open world rewards | — | — | Yes |
| Works offline | Yes | Yes | Plays offline, syncs when back online |

游客和本机账号的进度只存在这个浏览器里；云端账号的进度存在游戏服务器上，换设备登录也在。

Sign in or register from the account button at the top right. A local account can be upgraded to a cloud account later from the account page; its progress comes along.

右上角的账号按钮可以登录或注册。本机账号以后可以在账号页升级成云端账号，进度一起带过去。

## Syncing Between Devices / 多设备同步

- Progress made on two devices is **added together**, not overwritten. Wins, losses and hero fragments are sent as "what changed since the last save", and the server counts each change exactly once, even after retries, reloads or reconnects.
- Stage stars and best scores keep the higher value, unlocked heroes are combined, and story progress keeps the further point.
- If you are offline, progress waits on the device and is sent the next time it can be.
- Several tabs in one browser always stay on the same account. Signing in or out in one tab updates the others once they are back in a menu, never in the middle of a match.

两台设备上的进度会 **加在一起**，不会互相覆盖；重试、刷新、重连都不会重复计算。离线时进度先留在设备上，联网后再发。

## Devices And Sign-In / 设备与登录

- The account page lists every device signed in to your account (for example 「iPhone · Safari」) and when it was last used. You can sign out any one of them, or all of them at once.
- After several wrong passwords the server may ask for a quick human check before you can try again.
- If the page says **登录过期 / Session expired**, sign in again; unsent progress is kept on the device.

账号页能看到所有登录着的设备，可以单独退出某一台，也可以全部退出。

## Backups / 备份

The account page can export your profile to a file and import it again. Exported files are signed, so the game can tell when a file was edited.

账号页可以把存档导出成文件、再导入回来。导出的文件带签名，被改过的文件导入时会被认出来。

## What The Server Stores / 服务器存什么

- Your account name, your save, armory, Ink ledger, match records and leaderboard entries.
- Passwords only as salted PBKDF2 hashes. Session tokens only as hashes, so a copy of the database contains no usable login.
- A sign-in log (sign-ins, failed sign-ins, sign-outs) kept for 90 days. IP addresses in it are stored only as a short one-way code, so the address cannot be read back.
- Crash reports from the page (uncaught errors) and rare suspicious-damage reports, used to fix bugs and catch cheating. They contain no passwords.

There are no ads, no tracking scripts and no third-party analytics. The online page keeps its own anonymous play stats (page opens, tutorial progress, which mode each match is) tied only to a random browser ID that the server salts and hashes; no name, account, email or IP is stored, and Settings → Anonymous stats turns it off. The offline edition sends nothing.

服务器只存账号名、存档、武库、墨锭流水、对局记录和排行榜。密码和登录令牌都只存哈希。没有广告、没有跟踪脚本、没有第三方统计。在线版有自己的匿名游玩统计（打开网页、新手教学、开了哪个模式），只带一个本机随机编号（服务器加盐哈希后才存），不存名字、账号、邮箱、IP，设置里「匿名统计」可以关；离线版什么都不发。

## Deleting An Account / 删除账号

Ask the maintainer (see [security.md](https://github.com/AMFI-Disable/RenYing/blob/main/.github/security.md) for contact details). A deleted account is signed out everywhere and hidden from leaderboards and the market.

## For Developers / 开发者

- Client: `src/cloud.js` (sync, tokens, offline queue) and `src/game/24-account.js` (account page).
- Server: `cloudflare/worker.js`; tables in `cloudflare/schema.sql`, changes as numbered files in `cloudflare/migrations/`.
- Tests: `node tools/tests/cloud-test.mjs` and `node tools/tests/sync-test.mjs`.
- Admin tools and roles: [docs/ops/admin.md](https://github.com/AMFI-Disable/RenYing/blob/main/docs/ops/admin.md) (Chinese).
