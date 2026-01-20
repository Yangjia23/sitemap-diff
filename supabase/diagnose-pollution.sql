-- 诊断数据污染情况

-- 1. 检查 sitemaps 表中的异常记录
SELECT
    '异常 Sitemap 记录' as category,
    COUNT(*) as count
FROM sitemaps
WHERE url_count < 10;

SELECT
    domain,
    url_count,
    updated_at
FROM sitemaps
WHERE url_count < 10
ORDER BY updated_at DESC;

-- 2. 查看最近添加的游戏统计（按天）
SELECT
    '最近游戏增长' as category,
    DATE(first_seen) as date,
    COUNT(*) as new_games
FROM games
WHERE first_seen > NOW() - INTERVAL '7 days'
GROUP BY DATE(first_seen)
ORDER BY date DESC;

-- 3. 查看异常的大批量新增
SELECT
    '各域名游戏数' as category,
    gs.domain,
    COUNT(DISTINCT gs.game_id) as game_count,
    MIN(gs.first_seen) as first_added,
    MAX(gs.first_seen) as last_added
FROM game_sources gs
GROUP BY gs.domain
ORDER BY game_count DESC
LIMIT 20;

-- 4. 查看今天新增的游戏数量
SELECT
    '今日新增' as category,
    COUNT(*) as today_new_games
FROM games
WHERE DATE(first_seen) = CURRENT_DATE;

-- 5. 总览
SELECT
    '总览' as category,
    (SELECT COUNT(*) FROM games) as total_games,
    (SELECT COUNT(*) FROM game_sources) as total_sources,
    (SELECT COUNT(*) FROM sitemaps) as total_sitemaps,
    (SELECT COUNT(*) FROM sitemaps WHERE url_count < 10) as invalid_sitemaps;
