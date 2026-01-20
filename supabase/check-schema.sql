-- 检查 sitemaps 表的实际结构

-- 1. 查看表是否存在
SELECT EXISTS (
   SELECT FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name = 'sitemaps'
) AS table_exists;

-- 2. 查看所有列
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'sitemaps'
ORDER BY ordinal_position;

-- 3. 查看索引
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'sitemaps';

-- 4. 查看 RLS 策略
SELECT
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'sitemaps';
