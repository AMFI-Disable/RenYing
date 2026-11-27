-- 0014_retired_hero_skins.sql
-- 退场侠客（幽篁、破浪）的 14 款武库饰品：玩家市场上的挂单和成交记录换成接替的那一款（同一武器箱、同一品质），
-- 和 src/armory-core.js 的 C.RETIRED 一一对应。只改 k 和 item_json 里的 k，编号、斩数、标价、状态都不动

UPDATE mkt SET k = 'ql_sf1', item_json = json_set(item_json, '$.k', 'ql_sf1') WHERE k = 'yu_sf1';
UPDATE mkt SET k = 'xw_sf1', item_json = json_set(item_json, '$.k', 'xw_sf1') WHERE k = 'pl_sf1';
UPDATE mkt SET k = 'ql_ic1', item_json = json_set(item_json, '$.k', 'ql_ic1') WHERE k = 'yu_ic1';
UPDATE mkt SET k = 'xw_ic1', item_json = json_set(item_json, '$.k', 'xw_ic1') WHERE k = 'pl_ic1';
UPDATE mkt SET k = 'ql_ic3', item_json = json_set(item_json, '$.k', 'ql_ic3') WHERE k = 'yu_ic3';
UPDATE mkt SET k = 'ql_ic4', item_json = json_set(item_json, '$.k', 'ql_ic4') WHERE k = 'yu_ic4';
UPDATE mkt SET k = 'xw_st1', item_json = json_set(item_json, '$.k', 'xw_st1') WHERE k = 'pl_st1';
UPDATE mkt SET k = 'xw_st2', item_json = json_set(item_json, '$.k', 'xw_st2') WHERE k = 'pl_st2';
UPDATE mkt SET k = 'xw_st3', item_json = json_set(item_json, '$.k', 'xw_st3') WHERE k = 'pl_st3';
UPDATE mkt SET k = 'xw_st4', item_json = json_set(item_json, '$.k', 'xw_st4') WHERE k = 'pl_st4';
UPDATE mkt SET k = 'xw_ym1', item_json = json_set(item_json, '$.k', 'xw_ym1') WHERE k = 'yu_ym1';
UPDATE mkt SET k = 'xw_ym2', item_json = json_set(item_json, '$.k', 'xw_ym2') WHERE k = 'yu_ym2';
UPDATE mkt SET k = 'ql_ym3', item_json = json_set(item_json, '$.k', 'ql_ym3') WHERE k = 'yu_ym3';
UPDATE mkt SET k = 'li_ym4', item_json = json_set(item_json, '$.k', 'li_ym4') WHERE k = 'yu_ym4';

-- 回滚：新编号的挂单里分不出哪些原来是旧款，不能按编号换回去；需要时从部署前导出的备份恢复 mkt 表（见 docs/ops/deploy-runbook.md）
