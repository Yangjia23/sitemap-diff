-- 清理被污染的数据
-- 执行前请确认要清理的数据范围

-- ==========================================
-- 方案一：只清理 sitemaps 表（推荐）
-- ==========================================
-- 删除 URL 数量为 0 或异常少的 sitemap 记录
-- 这样下次运行会重新进行首次检查

-- 1. 先查看有问题的记录
SELECT domain, url_count, updated_at
FROM sitemaps
WHERE url_count < 10
ORDER BY url_count, domain;

-- 2. 确认后执行删除（取消下面的注释）
-- DELETE FROM sitemaps
-- WHERE url_count < 10;

-- 3. 查看删除结果
-- SELECT COUNT(*) as remaining_sitemaps FROM sitemaps;


-- ==========================================
-- 方案二：清理相关的游戏数据（慎用）
-- ==========================================
-- 如果某些域名的游戏数据完全是误报，可以删除

-- 1. 查看各域名的游戏数量
SELECT
    domain,
    COUNT(DISTINCT gs.game_id) as game_count,
    MIN(gs.first_seen) as earliest_game
FROM game_sources gs
GROUP BY domain
ORDER BY game_count DESC;

-- 2. 查看特定域名的游戏（替换 'example.com'）
-- SELECT
--     g.name,
--     g.platform_count,
--     gs.url,
--     gs.first_seen
-- FROM games g
-- JOIN game_sources gs ON g.id = gs.game_id
-- WHERE gs.domain = 'example.com'
-- ORDER BY gs.first_seen DESC
-- LIMIT 20;

-- 3. 删除特定域名的所有游戏来源（会级联删除游戏）
-- 警告：只删除该域名是游戏唯一来源的游戏
-- DELETE FROM game_sources
-- WHERE domain = 'example.com';


-- ==========================================
-- 方案三：按时间清理最近的污染数据
-- ==========================================
-- 如果知道污染发生的时间范围

-- 1. 查看最近添加的游戏统计
SELECT
    DATE(first_seen) as date,
    COUNT(*) as new_games_count
FROM games
WHERE first_seen > NOW() - INTERVAL '7 days'
GROUP BY DATE(first_seen)
ORDER BY date DESC;

-- 2. 查看特定时间段的游戏
-- SELECT name, platform_count, first_seen
-- FROM games
-- WHERE first_seen > '2025-01-20 00:00:00'
-- ORDER BY first_seen DESC;

-- 3. 删除特定时间段的游戏来源
-- 警告：这会删除该时间段所有新增的游戏来源
-- DELETE FROM game_sources
-- WHERE first_seen > '2025-01-20 00:00:00';

-- 4. 清理孤立的游戏记录（没有任何来源的游戏）
-- DELETE FROM games
-- WHERE id NOT IN (SELECT DISTINCT game_id FROM game_sources);


-- ==========================================
-- 方案四：完全重置（终极方案）
-- ==========================================
-- 清空所有数据，从头开始

-- 警告：这会删除所有游戏数据！
-- TRUNCATE TABLE game_sources CASCADE;
-- TRUNCATE TABLE games CASCADE;
-- TRUNCATE TABLE sitemaps CASCADE;
-- TRUNCATE TABLE update_logs CASCADE;

-- 保留 feeds 表（sitemap 订阅源配置）
