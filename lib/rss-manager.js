/**
 * RSS 管理器 - V2 Fixed
 * 对比 sitemap 前后版本，只处理新增 URL
 */

import {
  getFeeds,
  addFeed as addFeedToDb,
  removeFeed as removeFeedFromDb,
  getSitemapContent,
  saveSitemapContent,
  upsertGame,
  logUpdate
} from './supabase.js';

/**
 * 从 XML 内容提取 URL
 */
function extractURLs(content) {
  const urls = [];
  const regex = /<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

/**
 * 从 URL 提取游戏名称
 * 返回 { name, cleanName } 或 null（如果不是游戏URL）
 */
function extractGameName(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;

    // === 第一步：通过路径特征排除 ===
    const excludePatterns = [
      /\/(tag|tags|category|categories|genre|genres|author|user|profile)\//i,
      /\/(about|contact|privacy|terms|faq|help|search|login|register)\//i,
      /\/(blog|news|press|careers|jobs|advertise)\//i,
      /\/(sitemap|robots|feed|rss|atom)($|\/|\.|\.xml)/i,
      /\.(xml|json|txt|css|js|png|jpg|gif|ico|svg)$/i,
      /^\/$/,  // 首页
      /^\/[a-z]{2}\/?$/i,  // 语言首页
    ];

    for (const pattern of excludePatterns) {
      if (pattern.test(pathname)) {
        return null;
      }
    }

    // === 第二步：提取游戏名称（按平台规则）===
    let gameName = null;

    // poki.com/en/g/game-name
    if (hostname.includes('poki.com')) {
      const match = pathname.match(/\/g\/([^\/\?]+)$/);
      if (match) gameName = match[1];
    }
    // coolmathgames.com/0-game-name
    else if (hostname.includes('coolmathgames.com')) {
      const match = pathname.match(/\/(\d+-[^\/\?]+)$/);
      if (match) gameName = match[1].replace(/^\d+-/, '');
    }
    // itch.io - 子域名形式
    else if (hostname.includes('itch.io')) {
      if (hostname !== 'itch.io') {
        const match = pathname.match(/^\/([^\/\?]+)$/);
        if (match && !['jam', 'jams', 'games', 'tools', 'assets'].includes(match[1])) {
          gameName = match[1];
        }
      }
    }
    // kongregate.com/games/user/game-name
    else if (hostname.includes('kongregate.com')) {
      const match = pathname.match(/\/games\/[^\/]+\/([^\/\?]+)$/);
      if (match) gameName = match[1];
    }
    // armorgames.com/game/game-slug
    else if (hostname.includes('armorgames.com')) {
      const match = pathname.match(/\/(?:game|play)\/([^\/\?]+)$/);
      if (match) gameName = match[1];
    }
    // newgrounds.com/portal/view/id
    else if (hostname.includes('newgrounds.com')) {
      const match = pathname.match(/\/portal\/view\/(\d+)$/);
      if (match) gameName = `newgrounds-${match[1]}`;
    }
    // miniclip.com/games/game-name
    else if (hostname.includes('miniclip.com')) {
      const match = pathname.match(/\/games\/([^\/\?]+)$/);
      if (match && match[1] !== 'genre') gameName = match[1];
    }
    // y8.com/games/game-name
    else if (hostname.includes('y8.com')) {
      const match = pathname.match(/\/games\/([^\/\?]+)$/);
      if (match) gameName = match[1];
    }
    // friv.com/game/game-name
    else if (hostname.includes('friv.com')) {
      const match = pathname.match(/\/(?:game|play)\/([^\/\?]+)$/);
      if (match) gameName = match[1];
    }
    // 通用规则：/games/xxx, /game/xxx, /play/xxx, /g/xxx
    else {
      const patterns = [
        /\/(?:games?|play|g)\/([^\/\?]+)$/i,
        /\/([^\/\?]+)-game$/i,
        /\/([^\/\?]+)\.html?$/i,
      ];

      for (const pattern of patterns) {
        const match = pathname.match(pattern);
        if (match) {
          gameName = match[1].replace(/\.html?$/, '');
          break;
        }
      }

      // 兜底规则：单路径格式 /game-slug（需要更严格的检查）
      if (!gameName) {
        const singlePathMatch = pathname.match(/^\/([^\/\?]+)$/);
        if (singlePathMatch) {
          gameName = singlePathMatch[1];
        }
      }
    }

    if (!gameName || gameName.length < 2 || gameName.length > 100) {
      return null;
    }

    // === 第三步：排除分类页面关键词 ===
    const categoryKeywords = [
      // 常见分类
      'games', 'all-games', 'new-games', 'hot-games', 'popular-games', 'trending-games',
      'top-games', 'featured-games', 'best-games', 'free-games', 'all-tags',
      'top-popular',

      // 游戏类型（重点排除）
      'action-games', 'adventure-games', 'puzzle-games', 'racing-games',
      'sports-games', 'strategy-games', 'shooting-games', 'arcade-games',
      'casual-games', 'multiplayer-games', 'io-games', 'html5-games',
      'girl-games', 'boy-games', 'kids-games', 'girls-games', 'boys-games',
      '2-player-games', 'multiplayer', 'single-player',

      // 其他导航页面
      'about', 'contact', 'privacy', 'terms', 'faq', 'help', 'support',
      'blog', 'news', 'press', 'careers', 'jobs', 'advertise',
      'category', 'categories', 'tag', 'tags', 'genre', 'genres',
      'online', 'offline', 'download', 'downloads',
      'login', 'register', 'signup', 'signin',
      'search', 'browse', 'index', 'home', 'recents', 'updated', 
      'terms-of-service', 'privacy-policy', 'contact-us', 'about-us'
    ];

    const lowerGameName = gameName.toLowerCase();

    // 精确匹配
    if (categoryKeywords.includes(lowerGameName)) {
      return null;
    }

    // 模糊匹配：以 -games 或 -game 结尾（很可能是分类）
    if (/-games?$/.test(lowerGameName)) {
      // 但排除一些真正的游戏名（如 "hunger-games", "squid-game"）
      const validGamePatterns = [
        /hunger-games?$/,
        /squid-games?$/,
        /mario-games?$/,
        /pokemon-games?$/,
        /sonic-games?$/,
      ];

      const isValidGame = validGamePatterns.some(p => p.test(lowerGameName));
      if (!isValidGame) {
        return null;  // 排除分类页面
      }
    }

    // 清理并标准化
    const cleanName = normalizeGameName(gameName);
    if (!cleanName || cleanName.length < 2) {
      return null;
    }

    return { name: gameName, cleanName };
  } catch {
    return null;
  }
}

/**
 * 标准化游戏名称
 */
function normalizeGameName(name) {
  return name
    .toLowerCase()
    .replace(/[-_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export class RSSManager {
  constructor() { }

  async getFeeds() {
    return await getFeeds();
  }

  /**
   * 处理 sitemap - 核心逻辑（修复版）
   */
  async downloadSitemap(sitemapUrl) {
    try {
      console.log(`下载 sitemap: ${sitemapUrl}`);

      const domain = new URL(sitemapUrl).hostname;

      // 1. 下载新 sitemap
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };

      const response = await fetch(sitemapUrl, { method: 'GET', headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let newContent;
      if (sitemapUrl.endsWith('.gz')) {
        const buffer = await response.arrayBuffer();
        const { gunzipSync } = await import('zlib');
        newContent = gunzipSync(Buffer.from(buffer)).toString('utf-8');
      } else {
        newContent = await response.text();
      }

      // 2. 提取新 sitemap 的所有 URL
      const newUrls = extractURLs(newContent);
      console.log(`  新 sitemap: ${newUrls.length} 个 URL`);

      // 检查：如果解析出 0 个 URL，认为是获取失败
      if (newUrls.length === 0) {
        console.warn(`  ⚠️  警告: 未从 sitemap 中提取到任何 URL，可能是格式问题或网络问题`);
        return {
          success: false,
          errorMsg: '未能从 sitemap 提取到 URL',
          newGames: [],
          crossPlatformGames: [],
          totalUrls: 0,
          newUrls: 0
        };
      }

      // 3. 获取旧 sitemap（如果存在）
      const oldContent = await getSitemapContent(domain);
      let diffUrls = [];

      if (oldContent) {
        const oldUrls = extractURLs(oldContent);
        console.log(`  旧 sitemap: ${oldUrls.length} 个 URL`);

        // 异常检查：新 sitemap URL 数量远少于旧的（可能是获取不完整）
        if (oldUrls.length > 0 && newUrls.length < oldUrls.length * 0.5) {
          console.warn(`  ⚠️  警告: 新 sitemap URL 数量(${newUrls.length}) 远少于旧的(${oldUrls.length})，可能获取不完整，跳过更新`);
          return {
            success: false,
            errorMsg: `URL 数量异常: 新=${newUrls.length}, 旧=${oldUrls.length}`,
            newGames: [],
            crossPlatformGames: [],
            totalUrls: newUrls.length,
            newUrls: 0
          };
        }

        // 找出新增的 URL（在新 sitemap 中但不在旧 sitemap 中）
        const oldUrlSet = new Set(oldUrls);
        diffUrls = newUrls.filter(u => !oldUrlSet.has(u));
        console.log(`  新增 URL: ${diffUrls.length} 个`);
      } else {
        // 首次检查：需要验证 URL 数量是否合理
        if (newUrls.length < 10) {
          console.warn(`  ⚠️  警告: 首次检查 URL 数量过少(${newUrls.length})，可能不是有效的 sitemap，跳过保存`);
          return {
            success: false,
            errorMsg: `首次检查 URL 数量过少: ${newUrls.length}`,
            newGames: [],
            crossPlatformGames: [],
            totalUrls: newUrls.length,
            newUrls: 0
          };
        }

        console.log(`  首次检查，保存 ${newUrls.length} 个 URL（下次才会检测新增）`);
        // 首次检查：保存 sitemap 但不处理（下次才对比）
        await saveSitemapContent(domain, newContent, newUrls.length);
        return {
          success: true,
          errorMsg: '',
          newGames: [],
          crossPlatformGames: [],
          totalUrls: newUrls.length,
          newUrls: 0,
          isFirstCheck: true
        };
      }

      // 4. 处理新增 URL，提取游戏
      const newGames = [];
      const crossPlatformGames = [];
      let parsedCount = 0;
      let skippedCount = 0;

      for (const url of diffUrls) {
        const gameInfo = extractGameName(url);
        if (!gameInfo) {
          skippedCount++;
          if (skippedCount <= 3) {
            console.log(`    ⊗ 跳过: ${url.substring(0, 80)}`);
          }
          continue;
        }

        parsedCount++;
        if (parsedCount <= 3) {
          console.log(`    ✓ 游戏: ${gameInfo.name}`);
        }

        const result = await upsertGame(gameInfo.name, gameInfo.cleanName, domain, url);
        if (!result) continue;

        if (result.isNew) {
          newGames.push({
            name: gameInfo.name,
            url,
            isCrossPlatform: false
          });
        } else if (result.isCrossPlatform) {
          crossPlatformGames.push({
            name: gameInfo.name,
            url,
            isCrossPlatform: true,
            platformCount: result.game.platform_count
          });
        }
      }

      console.log(`  识别: ${parsedCount} 个游戏, 跳过: ${skippedCount} 个非游戏URL`);

      // 5. 保存新 sitemap
      await saveSitemapContent(domain, newContent, newUrls.length);

      // 6. 记录日志
      const allNewGames = [...newGames, ...crossPlatformGames];
      if (allNewGames.length > 0) {
        await logUpdate(domain, allNewGames);
      }

      console.log(`  结果: ${newGames.length} 新游戏, ${crossPlatformGames.length} 跨平台`);

      return {
        success: true,
        errorMsg: '',
        newGames,
        crossPlatformGames,
        totalUrls: newUrls.length,
        newUrls: diffUrls.length
      };

    } catch (error) {
      console.error(`下载 sitemap 失败: ${sitemapUrl}`, error);
      return {
        success: false,
        errorMsg: `下载失败: ${error.message}`,
        newGames: [],
        crossPlatformGames: []
      };
    }
  }

  /**
   * 添加 sitemap 监控
   */
  async addFeed(url) {
    const result = await this.downloadSitemap(url);

    if (result.success) {
      await addFeedToDb(url);
    }

    return {
      ...result,
      newUrls: result.newGames?.map(g => g.url) || []
    };
  }

  /**
   * 删除 RSS 订阅
   */
  async removeFeed(url) {
    try {
      const feeds = await this.getFeeds();
      if (!feeds.includes(url)) {
        return { success: false, errorMsg: '该RSS订阅不存在' };
      }

      const removed = await removeFeedFromDb(url);
      return removed
        ? { success: true, errorMsg: '' }
        : { success: false, errorMsg: '删除失败' };

    } catch (error) {
      console.error(`删除 RSS 订阅失败: ${url}`, error);
      return { success: false, errorMsg: `删除失败: ${error.message}` };
    }
  }
}
