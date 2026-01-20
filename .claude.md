# Sitemap Diff - 项目文档

## 项目概述
监控多个网站的 sitemap，检测新增游戏，追踪跨平台游戏。提供 Web Dashboard 进行管理。

## 架构 (V2.0)

```
┌─────────────────────┐     ┌─────────────────┐
│  GitHub Actions     │────▶│  Supabase       │
│  (定时检查 sitemap) │     │  (数据存储)      │
└─────────────────────┘     └────────┬────────┘
                                     │
┌─────────────────────┐              │
│  Web Dashboard      │◀─────────────┘
│  (Vercel Next.js)   │
│  - 游戏浏览         │
│  - Sitemap 管理     │
│  - 统计面板         │
└─────────────────────┘
```

### 组件说明
- **GitHub Actions**: 每 4 小时定时执行 sitemap 检查，无 CPU 限制
- **Supabase**: 存储游戏数据、游戏来源、订阅源
- **Web Dashboard**: Next.js 应用，提供可视化管理界面
  - 实时统计面板
  - 游戏浏览和搜索
  - Sitemap 管理
  - 跨平台游戏追踪

## 目录结构

```
sitemap-diff/
├── lib/                      # 爬虫核心库
│   ├── supabase.js           # Supabase 客户端
│   ├── rss-manager.js        # RSS 管理器（游戏提取）
│   ├── check-sitemaps.js     # 定时检查脚本
│   └── load-env.js           # 环境变量加载
├── web/                      # Web Dashboard (Next.js)
│   ├── src/
│   │   ├── components/       # React 组件
│   │   ├── pages/            # 页面 (Dashboard, Games, Sitemaps)
│   │   ├── lib/              # Supabase 客户端
│   │   └── styles/           # 全局样式
│   ├── public/               # 静态资源
│   └── package.json
├── supabase/
│   ├── schema.sql            # V2 数据库表结构
│   └── migration.sql         # V1→V2 迁移脚本
├── .github/workflows/
│   └── check-sitemaps.yml    # GitHub Actions
├── vercel.json               # Vercel 配置（API + Web）
└── package.json              # 爬虫依赖
```

## 环境变量

### GitHub Actions Secrets
- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_SERVICE_KEY` - Supabase 服务密钥

### Vercel Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase 项目 URL（公开）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase Publishable/Anon Key（公开）

## 部署步骤

### 1. 创建 Supabase 项目
1. 在 Supabase 创建新项目
2. 执行 `supabase/schema.sql` 创建表

### 2. 部署 Web Dashboard 到 Vercel
```bash
cd web
npm install
cd ..
vercel deploy --prod
```

在 Vercel 项目设置中添加环境变量：
- `NEXT_PUBLIC_SUPABASE_URL` - 从 Supabase Dashboard 获取
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - 从 Supabase Dashboard 获取

### 3. 配置 GitHub Actions
在仓库 Settings > Secrets 添加所有环境变量：
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### 4. 访问 Dashboard
部署成功后，访问你的 Vercel 域名即可使用管理界面

## 开发命令

### 爬虫
```bash
npm run check    # 本地运行 sitemap 检查
```

### Web Dashboard
```bash
cd web
npm install      # 安装依赖
npm run dev      # 本地开发服务器 (http://localhost:3000)
npm run build    # 构建生产版本
npm start        # 启动生产服务器
```

## Web Dashboard 功能

### 📊 Dashboard 页面
- 实时统计卡片（总游戏数、平台数、跨平台游戏、高分游戏）
- Top 6 跨平台游戏展示
- 系统状态指示器

### 🎮 Games 页面
- 所有游戏列表（按分数排序）
- 搜索功能（游戏名称）
- 筛选功能：
  - 按平台数量（2+, 3+, 4+）
  - 按域名
- 每个游戏显示：
  - 游戏名称和 ID
  - 平台数量 badge
  - 推荐分数（带进度条）
  - 所有平台链接

### 🗺️ Sitemaps 页面
- 所有配置的 sitemap 列表
- 添加新 sitemap（URL 输入）
- 删除 sitemap
- 显示域名、添加时间、更新时间

## 设计特色

- **赛博朋克霓虹风格**：青色+洋红色+黄色的霓虹配色
- **独特字体**：Rajdhani（显示）+ JetBrains Mono（代码）
- **流畅动画**：数字计数、卡片悬浮、页面加载
- **响应式设计**：完美支持移动端和桌面端

## 核心业务逻辑

### 1. Sitemap 检查机制

**对比前后版本，只处理新增 URL**

```javascript
// 下载新 sitemap
const newUrls = extractURLs(newContent);

// 获取旧 sitemap
const oldContent = await getSitemapContent(domain);
if (oldContent) {
  const oldUrls = extractURLs(oldContent);
  // 找出新增的 URL（差异对比）
  const oldUrlSet = new Set(oldUrls);
  diffUrls = newUrls.filter(u => !oldUrlSet.has(u));
} else {
  // 首次检查：保存但不处理（下次才对比）
  await saveSitemapContent(domain, newContent, newUrls.length);
}

// 处理新增 URL，提取游戏
for (const url of diffUrls) {
  const gameInfo = extractGameName(url);
  if (gameInfo) {
    await upsertGame(gameInfo.name, gameInfo.cleanName, domain, url);
  }
}
```

### 2. 游戏名称提取与过滤

**从 URL 中提取游戏名，排除分类页面**

```javascript
function extractGameName(url) {
  // 第一步：排除非游戏页面路径
  const excludePatterns = [
    /\/(tag|category|genre|author|user)\//,
    /\/(about|contact|privacy|terms|faq)\/,
    /\/(sitemap|robots|feed|rss|atom)($|\/|\.|\.xml)/
  ];

  // 第二步：按平台规则提取游戏名
  // poki.com/en/g/game-name
  // coolmathgames.com/0-game-name
  // itch.io 子域名形式
  // ...

  // 第三步：排除分类关键词
  const categoryKeywords = [
    'action-games', 'puzzle-games', 'casual-games',
    'new-games', 'hot-games', 'popular-games',
    // ...
  ];

  // 模糊匹配：以 -games 结尾的（排除真实游戏名）
  if (/-games?$/.test(lowerGameName)) {
    const validGamePatterns = [
      /hunger-games?$/, /squid-games?$/
    ];
    if (!validGamePatterns.some(p => p.test(lowerGameName))) {
      return null;  // 排除分类页面
    }
  }

  return { name: gameName, cleanName: normalizeGameName(gameName) };
}
```

### 3. 异常检测与数据保护

**防止空 sitemap 污染数据库**

```javascript
// 检测 1: 零 URL
if (newUrls.length === 0) {
  return { success: false, errorMsg: '未能提取到 URL' };
}

// 检测 2: URL 数量骤减（已有旧数据时）
if (oldUrls.length > 0 && newUrls.length < oldUrls.length * 0.5) {
  return { success: false, errorMsg: 'URL 数量异常' };
}

// 检测 3: 首次检查最小阈值
if (!oldContent && newUrls.length < 10) {
  return { success: false, errorMsg: '首次检查 URL 数量过少' };
}
```

### 4. 跨平台游戏追踪

**通过标准化名称匹配同一游戏**

```javascript
// 标准化：subway-surfers → subwaysurfers
function normalizeGameName(name) {
  return name.toLowerCase()
    .replace(/[-_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

// 创建/更新游戏
async function upsertGame(name, cleanName, domain, url) {
  // 1. 通过 cleanName 查找游戏
  let game = await findGameByCleanName(cleanName);

  if (!game) {
    // 新游戏：创建记录
    game = await createGame(name, cleanName);
  }

  // 2. 添加游戏来源
  const source = await addGameSource(game.id, domain, url);

  // 3. 更新平台计数
  if (source.isNew) {
    await updatePlatformCount(game.id);
  }

  return { game, isNew: !existingGame, isCrossPlatform: game.platform_count > 1 };
}
```

### 5. 数据库表结构

**games (游戏表)**: 每个游戏唯一记录
- `clean_name`: 标准化名称（用于跨平台匹配）
- `platform_count`: 出现在多少个平台

**game_sources (游戏来源表)**: 游戏在各平台的具体 URL
- `game_id`: 关联到 games 表
- `domain`: 平台域名
- `url`: 游戏在该平台的 URL
- 约束：`UNIQUE(game_id, domain)` - 每个游戏在同一平台只有一条记录

**sitemaps (Sitemap 内容表)**: 存储 sitemap 用于版本对比
- `domain`: 域名
- `content`: 完整 sitemap XML 内容
- `url_count`: URL 数量

## 维护工具

### 数据诊断
```bash
# 在 Supabase SQL Editor 执行
supabase/diagnose-pollution.sql
```
检查：
- 异常的 sitemap 记录（url_count < 10）
- 最近游戏增长统计
- 各域名游戏数量

### 数据清理
```bash
# 在 Supabase SQL Editor 执行
supabase/clean-polluted-data.sql
```
提供 4 种清理方案：
1. 只清理异常 sitemap（推荐）
2. 清理特定域名的游戏数据
3. 按时间清理污染数据
4. 完全重置（终极方案）

### Schema 刷新
如果遇到 `PGRST204` 错误（PostgREST 缓存过期）：
```sql
-- 在 Supabase SQL Editor 执行
NOTIFY pgrst, 'reload schema';
```

或在 Supabase Dashboard → Settings → API → 重启 PostgREST

## 已知问题与解决

### 1. TypeScript 编译错误
**问题**: `Type 'Set<string>' can only be iterated through when using '--downlevelIteration'`
**解决**: 修改 `web/tsconfig.json`，将 `target` 从 `"es5"` 改为 `"es2015"`

### 2. Vercel 构建失败：缺少 TypeScript
**问题**: `devDependencies` 在生产构建时不安装
**解决**: 将 `typescript`, `@types/*`, `tailwindcss` 等移至 `dependencies`

### 3. PostgREST Schema 缓存
**问题**: 数据库表结构更新后 API 仍报错 `column does not exist`
**解决**: 执行 `NOTIFY pgrst, 'reload schema';` 或重启 PostgREST

### 4. 空 Sitemap 污染数据库
**问题**: 首次解析出 0 个 URL，导致下次把所有游戏误判为新游戏
**解决**: 添加三层异常检测（零 URL、数量骤减、首次最小阈值）

## 开发历史

### V2.0 (2025-01-20)
- ✅ 修复核心逻辑：从数据库检查改为 sitemap 版本对比
- ✅ 增强游戏过滤：排除分类页面（action-games, puzzle-games 等）
- ✅ 添加异常检测：防止空 sitemap 污染数据库
- ✅ 删除通知功能：移除 Discord/Telegram 相关代码
- ✅ 修复构建问题：TypeScript 编译错误、Vercel 部署配置
- ✅ 添加维护工具：数据诊断、清理脚本
- ✅ 调整定时频率：从 8 小时改为 4 小时

### V1.0 (2024)
- 初始版本：Cloudflare Workers + KV 存储
- Discord/Telegram 通知功能
