-- Rename the first 25 persistent AI accounts (ai_01 .. ai_25) to modern, realistic usernames
-- Safe & idempotent: only updates locked AI accounts and never collides with real human players.
UPDATE ai_players SET username = '6767' WHERE uid = 'ai_01' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('6767') AND id != 'ai_01');
UPDATE users SET username = '6767' WHERE id = 'ai_01' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('6767') AND id != 'ai_01');

UPDATE ai_players SET username = '看见你' WHERE uid = 'ai_02' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('看见你') AND id != 'ai_02');
UPDATE users SET username = '看见你' WHERE id = 'ai_02' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('看见你') AND id != 'ai_02');

UPDATE ai_players SET username = '不吃香菜' WHERE uid = 'ai_03' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('不吃香菜') AND id != 'ai_03');
UPDATE users SET username = '不吃香菜' WHERE id = 'ai_03' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('不吃香菜') AND id != 'ai_03');

UPDATE ai_players SET username = '别打我' WHERE uid = 'ai_04' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('别打我') AND id != 'ai_04');
UPDATE users SET username = '别打我' WHERE id = 'ai_04' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('别打我') AND id != 'ai_04');

UPDATE ai_players SET username = 'xiaoming9' WHERE uid = 'ai_05' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('xiaoming9') AND id != 'ai_05');
UPDATE users SET username = 'xiaoming9' WHERE id = 'ai_05' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('xiaoming9') AND id != 'ai_05');

UPDATE ai_players SET username = 'kk0812' WHERE uid = 'ai_06' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('kk0812') AND id != 'ai_06');
UPDATE users SET username = 'kk0812' WHERE id = 'ai_06' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('kk0812') AND id != 'ai_06');

UPDATE ai_players SET username = '0419' WHERE uid = 'ai_07' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('0419') AND id != 'ai_07');
UPDATE users SET username = '0419' WHERE id = 'ai_07' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('0419') AND id != 'ai_07');

UPDATE ai_players SET username = '晚安玛卡巴卡' WHERE uid = 'ai_08' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('晚安玛卡巴卡') AND id != 'ai_08');
UPDATE users SET username = '晚安玛卡巴卡' WHERE id = 'ai_08' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('晚安玛卡巴卡') AND id != 'ai_08');

UPDATE ai_players SET username = 'linyi7' WHERE uid = 'ai_09' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('linyi7') AND id != 'ai_09');
UPDATE users SET username = 'linyi7' WHERE id = 'ai_09' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('linyi7') AND id != 'ai_09');

UPDATE ai_players SET username = 'yz_07' WHERE uid = 'ai_10' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('yz_07') AND id != 'ai_10');
UPDATE users SET username = 'yz_07' WHERE id = 'ai_10' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('yz_07') AND id != 'ai_10');

UPDATE ai_players SET username = '8823' WHERE uid = 'ai_11' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('8823') AND id != 'ai_11');
UPDATE users SET username = '8823' WHERE id = 'ai_11' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('8823') AND id != 'ai_11');

UPDATE ai_players SET username = '吃口西瓜' WHERE uid = 'ai_12' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('吃口西瓜') AND id != 'ai_12');
UPDATE users SET username = '吃口西瓜' WHERE id = 'ai_12' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('吃口西瓜') AND id != 'ai_12');

UPDATE ai_players SET username = 'chen77' WHERE uid = 'ai_13' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('chen77') AND id != 'ai_13');
UPDATE users SET username = 'chen77' WHERE id = 'ai_13' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('chen77') AND id != 'ai_13');

UPDATE ai_players SET username = '就打一把' WHERE uid = 'ai_14' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('就打一把') AND id != 'ai_14');
UPDATE users SET username = '就打一把' WHERE id = 'ai_14' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('就打一把') AND id != 'ai_14');

UPDATE ai_players SET username = 'k792' WHERE uid = 'ai_15' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('k792') AND id != 'ai_15');
UPDATE users SET username = 'k792' WHERE id = 'ai_15' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('k792') AND id != 'ai_15');

UPDATE ai_players SET username = '再打一局就睡' WHERE uid = 'ai_16' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('再打一局就睡') AND id != 'ai_16');
UPDATE users SET username = '再打一局就睡' WHERE id = 'ai_16' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('再打一局就睡') AND id != 'ai_16');

UPDATE ai_players SET username = 'skycn' WHERE uid = 'ai_17' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('skycn') AND id != 'ai_17');
UPDATE users SET username = 'skycn' WHERE id = 'ai_17' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('skycn') AND id != 'ai_17');

UPDATE ai_players SET username = 'momo酱' WHERE uid = 'ai_18' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('momo酱') AND id != 'ai_18');
UPDATE users SET username = 'momo酱' WHERE id = 'ai_18' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('momo酱') AND id != 'ai_18');

UPDATE ai_players SET username = 'm0x3' WHERE uid = 'ai_19' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('m0x3') AND id != 'ai_19');
UPDATE users SET username = 'm0x3' WHERE id = 'ai_19' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('m0x3') AND id != 'ai_19');

UPDATE ai_players SET username = '菜鸟报道' WHERE uid = 'ai_20' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('菜鸟报道') AND id != 'ai_20');
UPDATE users SET username = '菜鸟报道' WHERE id = 'ai_20' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('菜鸟报道') AND id != 'ai_20');

UPDATE ai_players SET username = 'zerok' WHERE uid = 'ai_21' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('zerok') AND id != 'ai_21');
UPDATE users SET username = 'zerok' WHERE id = 'ai_21' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('zerok') AND id != 'ai_21');

UPDATE ai_players SET username = '阿泽' WHERE uid = 'ai_22' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('阿泽') AND id != 'ai_22');
UPDATE users SET username = '阿泽' WHERE id = 'ai_22' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('阿泽') AND id != 'ai_22');

UPDATE ai_players SET username = '9527x' WHERE uid = 'ai_23' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('9527x') AND id != 'ai_23');
UPDATE users SET username = '9527x' WHERE id = 'ai_23' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('9527x') AND id != 'ai_23');

UPDATE ai_players SET username = '路过打酱油' WHERE uid = 'ai_24' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('路过打酱油') AND id != 'ai_24');
UPDATE users SET username = '路过打酱油' WHERE id = 'ai_24' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('路过打酱油') AND id != 'ai_24');

UPDATE ai_players SET username = 'nova23' WHERE uid = 'ai_25' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('nova23') AND id != 'ai_25');
UPDATE users SET username = 'nova23' WHERE id = 'ai_25' AND password_algo = 'ai-bot-locked' AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(username) = LOWER('nova23') AND id != 'ai_25');
