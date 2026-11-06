# Armory And Marketplace / 武库与市场

The armory (武库) is RenYing's cosmetic collection: hero skins and weapon looks. **Nothing in the armory changes how a hero plays**, and there is no real-money shop of any kind. Everything is bought with Ink earned by playing.

武库是刃影的外观收藏：侠客皮肤和武器外观。**武库里的东西不改变任何数值**，游戏里也没有任何真钱购买，所有东西都用玩游戏攒的墨锭换。

The numbers on this page are the defaults in `src/armory-core.js`. The maintainer can adjust some of them on the server, so the game itself is always the final word.

本页数字是 `src/armory-core.js` 里的默认值，维护者可以在服务器上调整其中一部分，以游戏里显示的为准。

## Ink / 墨锭

Ink is the only currency. You earn it from:

- daily and weekly tasks (play matches, land combos, win, cast ultimates),
- stage stars, Hero Chronicle parts and endings, and the tutorial,
- the server-wide story in the open world,
- selling items to other players on the market.

墨锭是唯一的货币，来自每日每周任务、关卡星级、侠客列传、新手教学、开放世界的江湖长卷，以及在玩家市场卖东西。

## Tabs / 武库的几页

| Tab | 页面 | What it does |
| :--- | :--- | :--- |
| Inventory | 库存 | Everything you own. Equip, inspect, list on the market. |
| Cases | 武器箱 | Buy and open weapon cases. |
| Peddler | 货郎 | One fixed-price offer at a time. |
| Player Market | 玩家市场 | Buy from and sell to other players. |
| Reforge Pact | 熔铸契 | Turn ten items into one of the next tier. |
| Jianghu Ops | 江湖行动 | Seasonal missions that earn stars (星章) for rewards, plus a weekly supply drop. |

## Quality Tiers / 品质

Five tiers, from most common to rarest. Odds are for a regular weapon case.

| Tier | 品质 | Colour | Regular case odds |
| :--- | :--- | :--- | :--- |
| 1 | 精铁 | Blue | 53% |
| 2 | 碧玉 | Purple | 27% |
| 3 | 灵犀 | Pink | 13% |
| 4 | 赤霄 | Red | 5.2% |
| 5 | ★ 绝世 | Gold | 1.8% |

About **20%** of opened items are **斩数版 (kill-count editions)**: they count how many knockouts you score while wearing them and show the count on the inspect and results screens.

开出来的东西约 **20%** 是 **斩数版**，会记录穿着它打出的击倒数。

## Weapon Cases / 武器箱

Eight cases, each a collection of its own. Every skin is in exactly one case.

| Case | Kind | Limit |
| :--- | :--- | :--- |
| 初刃, 霜华, 名剑, 江湖, 惊雷, 寒月 | Regular, all five tiers | 5 regular cases per day in total |
| 神兵 | Premium: tiers 3 to 5 only | 3 per day |
| 星座 | Zodiac: one skin per sign and tier, tiers 3 to 5 only | 1 per week |

Daily limits reset at midnight Beijing time. Regular cases also drop from matches now and then (a few times a week at most), and the weekly supply in Jianghu Ops unlocks after 5 matches.

每天的次数按北京时间零点刷新。普通武器箱偶尔也会在对局后掉落（每周有上限），江湖行动的每周补给打满 5 局就能领。

## Reforge Pacts / 熔铸契

Put in exactly **10 items of the same tier** (tiers 1 to 4). You get **one item of the next tier**. The possible results come from the cases your inputs belong to, and the contract shows the chance of each before you sign. Ten kill-count editions give a kill-count edition.

放入 **同一档的正好 10 件**，换出 **高一档的 1 件**。能换到什么取决于放进去的饰品来自哪些箱子，签之前会列出每一件的概率。

## Player Market / 玩家市场

- Set your own price, from 1 to 999,999 Ink. The game never sets or buys at a price.
- A listing stays up for 14 days. If it does not sell it comes back to your inventory by itself.
- **15%** of every sale is removed as a fee, so Ink does not pile up in the economy.
- No limit on how many items you list. **一键挂牌** lists your duplicates in batches.
- My Listings (我的挂单) can be filtered by tier and hero and sorted by price or expiry.

自己定价（1 到 999999 墨锭），挂 14 天没卖掉会自动退回库存；每笔成交扣 **15%** 手续费；挂单数量不设上限。

## Peddler / 货郎

A peddler costs 500 Ink in the shop. Opening it shows **one item at a time** at a fixed price (1.2 to 1.5 times that item's base value). Buy it, or skip to the next; you see at most 5 items. An opened peddler expires after 3 days.

货郎在商店卖 500 墨锭。打开后一次给你看一件、报一个固定价，不要就看下一件，最多 5 件；开封 3 天不处理就作废。

## Safety / 安全

- On a cloud account every armory action (opening, trading up, buying, selling, claiming rewards) is decided and recorded by the server, inside one database transaction. A page that was edited locally cannot create items or Ink.
- Opening many cases at once (**一键开启全部**) still respects the daily and weekly limits.
- Guests have no armory; sign in first. Local accounts keep their armory on the device only and cannot use the player market.

云端账号的每一次武库操作都由服务器在一个数据库事务里决定并记录，本地改网页造不出东西和墨锭。游客没有武库，要先登录；本机账号的武库只存在这台设备上，不能用玩家市场。

## For Developers / 开发者

- Rules, odds, prices and limits: `src/armory-core.js` (shared by the page and the Worker).
- Screens: `src/armory.js`.
- Server side: `cloudflare/worker.js` (`handleEcon`). Tests: `node tools/tests/econ-test.mjs`.
