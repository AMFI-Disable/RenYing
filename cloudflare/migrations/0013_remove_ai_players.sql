-- 0013_remove_ai_players.sql
-- 移除持久化 AI 玩家系统及所有 AI 账号数据（保留全部真人玩家数据、匿名训练样本与本地对战 AI）

DELETE FROM mkt WHERE seller IN (SELECT id FROM users WHERE password_algo = 'ai-bot-locked') AND state != 1;
DELETE FROM econ_log WHERE uid IN (SELECT id FROM users WHERE password_algo = 'ai-bot-locked') OR uid = 'ai_system';
DELETE FROM econ WHERE uid IN (SELECT id FROM users WHERE password_algo = 'ai-bot-locked');
DELETE FROM users WHERE password_algo = 'ai-bot-locked';
DELETE FROM rate WHERE k = 'ai:tick';
DROP TABLE IF EXISTS ai_players;
