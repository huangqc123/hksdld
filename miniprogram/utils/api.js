const { request, requestText, formatPercent, formatNumber, tierLabel, tierClass } = require('./util')
const { getNicknames, buildSearchText } = require('./nicknames')
const searchMeta = require('./search-meta')
const meta = require('./meta')

const DDRAGON = 'https://ddragon.leagueoflegends.com'
const HEXDATA = 'https://hexdata.com.cn'
const CDRAGON_ORIGIN = 'https://raw.communitydragon.org'

const CACHE_TTL = 15 * 60 * 1000
const MANIFEST_TTL = 5 * 60 * 1000
const MIN_AUGMENT_GAMES = 1000
const MIN_HERO_SAMPLE_RATIO = 0.005
const MIN_KIWI_POOL_SIZE = 100
const MIN_AUGMENT_LINK_RATE = 0.9
const SUPPORTED_HEXDATA_SCHEMAS = ['hexdata-ai-summary-v1']

let cachedVersion = ''
let cachedChampions = null
let championMap = null
let staticDataPending = null
let augmentsCache = null
let augmentsAt = 0
let augmentsPending = null
let aramListCache = null
let aramListAt = 0
let aramListPending = null
let itemsCache = null
let itemsAt = 0
let itemsPending = null
let hexManifestCache = null
let hexManifestAt = 0
let hexManifestPending = null
let aramListBuildId = ''
let augmentsBuildId = ''

const RARITY_MAP = {
  1: { key: 'silver', name: '白银', color: '#c0c9d6', order: 1 },
  4: { key: 'gold', name: '黄金', color: '#f0c75e', order: 2 },
  8: { key: 'prismatic', name: '棱彩', color: '#d4a0ff', order: 3 }
}

const MARKSMAN_CONFLICT_AUGMENTS = {
  ARAM_Goliath: '重装巨人化',
  ARAM_MindtoMatter: '法力坦克化',
  ARAM_DrawYourSword: '近战转职',
  ARAM_Quest_SteelYourHeart: '心之钢任务',
  ARAM_HeavyHitter: '生命值伤害流',
  ARAM_Upgrade_Immolate: '献祭坦克升级',
  ARAM_TankEngine: '坦克化成长',
  ARAM_Quest_VoidImmolation: '坦克装备任务',
  EndlessDecimation: '重装战士技能',
  PressureCooker: '最大生命值伤害',
  Upgrade_SunderedSky: '重装战士升级'
}

function champIcon(version, id) {
  return `${DDRAGON}/cdn/${version}/img/champion/${id}.png`
}

function rarityInfo(rarity) {
  return RARITY_MAP[rarity] || { key: 'unknown', name: '未知', color: '#9aa4b2', order: 0 }
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim()
}

function cleanDesc(s) {
  return stripHtml(s)
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/@[^@\s]{1,160}@/g, '')
    .replace(/@[A-Za-z][\w.:*]{2,80}/g, '')
    .replace(/%i:[^%]+%/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/（\s*）/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/获得%/g, '获得额外')
    .replace(/造成%/g, '造成额外')
    .replace(/至多至%/g, '有一定上限')
    .replace(/提升至%/g, '获得提升')
    .replace(/获得个/g, '获得')
    .replace(/获得次/g, '获得')
    .replace(/获得层/g, '获得')
    .replace(/获得顶/g, '获得')
    .replace(/戴着顶/g, '戴着')
    .replace(/参与击杀次/g, '参与击杀')
    .replace(/失效秒/g, '短暂失效')
    .replace(/持续秒/g, '持续一段时间')
    .replace(/降低额外的/g, '降低')
    .replace(/%%/g, '%')
    .replace(/\s{2,}/g, ' ')
    .replace(/ ，/g, '，')
    .replace(/。+/g, '。')
    .trim()
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parseNumber(s) {
  return Number(String(s || '').replace(/,/g, '').replace(/%/g, '')) || 0
}

function parseHexdataMeta(html) {
  const text = String(html || '')
  return {
    patch: (text.match(/Patch\s+([0-9.]+)/i) || [])[1] || '',
    dataDate: (text.match(/hexdata-report-date" content="([^"]+)/i) || [])[1] || '',
    buildId: (text.match(/hexdata-build-id" content="([^"]+)/i) || [])[1] || '',
    source: 'Hexdata 国服 Queue 2400 样本'
  }
}

function cdragonIcon(base, path) {
  const clean = String(path || '')
    .replace(/^\/lol-game-data\/assets\//i, '')
    .replace(/^\//, '')
    .toLowerCase()
  return clean ? `${base}/plugins/rcp-be-lol-game-data/global/default/${clean}` : ''
}

function rarityFromClient(rarity) {
  if (rarity === 'kSilver') return 1
  if (rarity === 'kPrismatic') return 8
  if (rarity === 'kGold') return 4
  return 0
}

function rarityFromHexdata(rarity) {
  if (rarity === '白银') return 1
  if (rarity === '棱彩') return 8
  if (rarity === '黄金') return 4
  return 0
}

function absoluteUrl(base, path) {
  const value = String(path || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `${base}${value.charAt(0) === '/' ? '' : '/'}${value}`
}

function patchFromVersion(version) {
  return (String(version || '').match(/^(\d+\.\d+)/) || [])[1] || ''
}

function tierFromRank(index, total) {
  const percentile = total ? (index + 1) / total : 1
  if (percentile <= 0.15) return 1
  if (percentile <= 0.35) return 2
  if (percentile <= 0.65) return 3
  if (percentile <= 0.85) return 4
  return 5
}

function slugFromUrl(url) {
  return (String(url || '').match(/\/hero\/\d+-([^/?#]+)/) || [])[1] || ''
}

async function fetchHexManifest(force) {
  const now = Date.now()
  if (!force && hexManifestCache && now - hexManifestAt < MANIFEST_TTL) return hexManifestCache
  if (hexManifestPending) return hexManifestPending
  hexManifestPending = (async () => {
    const raw = await request(`${HEXDATA}/data/ai-summary.json`)
    if (!raw || SUPPORTED_HEXDATA_SCHEMAS.indexOf(raw.schemaVersion) < 0) {
      throw new Error(`不支持的 Hexdata schema: ${(raw && raw.schemaVersion) || 'missing'}`)
    }
    if (!raw.buildId || !raw.reportPatch || !raw.reportDate) {
      throw new Error('Hexdata manifest 缺少版本信息')
    }
    return {
      schemaVersion: raw.schemaVersion,
      buildId: raw.buildId,
      patch: raw.reportPatch,
      dataDate: raw.reportDate,
      generatedAt: raw.generatedAt || '',
      heroAliases: raw.heroAliases || [],
      source: 'Hexdata 国服 Queue 2400 样本'
    }
  })()
  try {
    const result = await hexManifestPending
    hexManifestCache = result
    hexManifestAt = Date.now()
    return result
  } finally {
    hexManifestPending = null
  }
}

async function resolveCdragonSource(reportPatch) {
  const base = `${CDRAGON_ORIGIN}/${reportPatch}`
  try {
    const metadata = await request(`${base}/content-metadata.json`)
    const actualPatch = patchFromVersion(metadata && metadata.version)
    if (actualPatch !== reportPatch) throw new Error('fixed patch mismatch')
    return { base, version: metadata.version, patch: actualPatch }
  } catch (e) {
    const latestBase = `${CDRAGON_ORIGIN}/latest`
    const metadata = await request(`${latestBase}/content-metadata.json`)
    const actualPatch = patchFromVersion(metadata && metadata.version)
    if (actualPatch !== reportPatch) {
      throw new Error(`CommunityDragon 版本不匹配: ${actualPatch || 'unknown'} != ${reportPatch}`)
    }
    return { base: latestBase, version: metadata.version, patch: actualPatch }
  }
}

async function getLatestVersion(force) {
  if (!force && cachedVersion) return cachedVersion
  const list = await request(`${DDRAGON}/api/versions.json`, { cache: true })
  cachedVersion = list[0]
  return cachedVersion
}

async function initStaticData(force) {
  if (!force && cachedChampions && championMap) {
    return { version: cachedVersion, champions: cachedChampions, championMap }
  }
  if (staticDataPending) return staticDataPending
  staticDataPending = (async () => {
    const versionPromise = getLatestVersion(force)
    const manifestPromise = fetchHexManifest(force).catch(() => null)
    const version = await versionPromise
    const [champRes, manifest] = await Promise.all([
      request(`${DDRAGON}/cdn/${version}/data/zh_CN/champion.json`, { cache: true }),
      manifestPromise
    ])
    const remoteAliases = {}
    ;((manifest && manifest.heroAliases) || []).forEach(row => {
      remoteAliases[Number(row.id)] = row
    })
    const champions = []
    const map = {}
    const data = champRes.data || {}
    Object.keys(data).forEach(key => {
      const c = data[key]
      const sm = searchMeta[c.id] || {}
      const remote = remoteAliases[Number(c.key)] || {}
      const nicknames = Array.from(new Set([].concat(
        sm.nicknames || getNicknames(c.id),
        remote.alternateNames || []
      ).filter(Boolean)))
      const item = {
        id: c.id,
        key: Number(c.key),
        name: c.name,
        title: c.title,
        tags: c.tags || [],
        icon: champIcon(version, c.id),
        nicknames,
        py: sm.py || '',
        qx: sm.qx || '',
        searchText: ''
      }
      item.searchText = [buildSearchText(item), item.py, item.qx].filter(Boolean).join(' ').toLowerCase()
      champions.push(item)
      map[item.key] = item
      map[String(item.key)] = item
      map[item.id.toLowerCase()] = item
    })
    champions.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    cachedChampions = champions
    championMap = map
    return { version, champions, championMap: map }
  })()
  try {
    return await staticDataPending
  } finally {
    staticDataPending = null
  }
}

function parseHeroRows(html) {
  const list = []
  const re = /<tr><td><a href="\/hero\/(\d+)-([^"]+)">([^<]+)<\/a><\/td><td>胜率\s*([0-9.]+)%\s*·\s*样本\s*([0-9,]+)/g
  let m
  while ((m = re.exec(String(html || '')))) {
    list.push({
      championId: Number(m[1]),
      slug: m[2],
      label: decodeHtml(m[3]),
      winRate: parseNumber(m[4]) / 100,
      play: parseNumber(m[5])
    })
  }
  const matches = list.reduce((sum, row) => sum + row.play, 0) / 10
  return list.map((row, index) => Object.assign(row, {
    pickRate: matches ? row.play / matches : 0,
    rank: index + 1,
    tier: tierFromRank(index, list.length)
  }))
}

function parseAugmentRows(html) {
  const list = []
  const re = /<tr><td><a href="\/augment\/(\d+)-([^"]+)">([^<]+)<\/a><\/td><td>(?:globalHexScore|综合评分)\s*([0-9.]+)\s*·\s*胜率\s*([0-9.]+)%/g
  let m
  while ((m = re.exec(String(html || '')))) {
    list.push({
      id: Number(m[1]),
      slug: m[2],
      name: decodeHtml(m[3]),
      score: parseNumber(m[4]),
      winRate: parseNumber(m[5]) / 100
    })
  }
  return list
}

function parseChampionAugmentJson(payload, champ, globalById, heroGames) {
  const isMarksman = (champ.tags || []).indexOf('Marksman') >= 0
  const minGames = Math.max(MIN_AUGMENT_GAMES, Math.ceil((Number(heroGames) || 0) * MIN_HERO_SAMPLE_RATIO))
  return ((payload && payload.augments) || []).map(raw => {
    const id = Number(raw.augmentId)
    const base = globalById[id] || {}
    const rarity = rarityFromHexdata(raw.rarity) || Number(base.rarity) || 0
    const rInfo = rarityInfo(rarity)
    const score = Number(raw.hexScore) || 0
    const winRate = Number(raw.pairWinRate) || 0
    const pickRate = Number(raw.pickRate) || 0
    const play = Number(raw.games) || 0
    const stableKey = base.key || String(id)
    const conflictLabel = isMarksman ? MARKSMAN_CONFLICT_AUGMENTS[stableKey] || '' : ''
    return Object.assign({}, base, {
      id,
      key: stableKey,
      name: raw.augmentName || base.name || String(id),
      desc: cleanDesc(raw.augmentDescription || base.desc || ''),
      tooltip: cleanDesc(raw.augmentDescription || base.tooltip || base.desc || ''),
      largeIcon: base.largeIcon || absoluteUrl(HEXDATA, raw.augmentIconUrl),
      smallIcon: base.smallIcon || absoluteUrl(HEXDATA, raw.augmentIconUrl),
      rarity,
      rarityName: rInfo.name,
      rarityKey: rInfo.key,
      rarityColor: rInfo.color,
      matched: true,
      score,
      performance: score,
      avgPerf: score,
      popular: pickRate,
      avgPop: pickRate,
      pickRate,
      winRate,
      play,
      games: play,
      fitTier: Number(raw.tier) || 5,
      globalTier: Number(raw.tier) || 5,
      perfText: score.toFixed(1),
      popText: formatPercent(pickRate),
      pickRateText: formatPercent(pickRate),
      winRateText: formatPercent(winRate),
      playText: formatNumber(play),
      sampleLevel: play >= 1000 ? 'high' : play >= 250 ? 'medium' : 'low',
      mechanicConflict: Boolean(conflictLabel),
      mechanicLabel: conflictLabel,
      stages: Array.isArray(raw.stages) ? raw.stages : [],
      champions: [{
        id: champ.key,
        tier: Number(raw.tier) || 5,
        score,
        performance: score,
        popular: pickRate,
        pickRate,
        winRate,
        play,
        games: play
      }]
    })
  }).filter(row => row.rarity && row.play >= minGames && !row.mechanicConflict)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.play - a.play
    })
}

function heroPublicPath(champ, stats) {
  const slug = (stats && stats.slug) || String((champ && champ.id) || '').toLowerCase()
  return `/hero/${champ.key}-${slug}`
}

function parseChampionAugmentTable(html, heroGames) {
  const list = []
  const re = /<tr><td><a href="\/augment\/(\d+)-([^"]+)">([^<]+)<\/a><\/td><td>([0-9.]+)<\/td><td>([0-9.]+)%<\/td><td>([0-9,]+)<\/td><\/tr>/g
  let m
  while ((m = re.exec(String(html || '')))) {
    const games = parseNumber(m[6])
    list.push({
      augmentId: Number(m[1]),
      slug: m[2],
      augmentName: decodeHtml(m[3]),
      hexScore: parseNumber(m[4]),
      pairWinRate: parseNumber(m[5]) / 100,
      games,
      pickRate: heroGames ? games / heroGames : 0
    })
  }
  return list
}

function parseAugmentHeroes(html) {
  const list = []
  const re = /<tr><td><a href="\/hero\/(\d+)-([^"]+)">([^<]+)<\/a><\/td><td>([0-9.]+)<\/td><td>([0-9.]+)%<\/td><td>([0-9,]+)<\/td><\/tr>/g
  let m
  while ((m = re.exec(String(html || '')))) {
    list.push({
      id: Number(m[1]),
      slug: m[2],
      name: decodeHtml(m[3]),
      score: parseNumber(m[4]),
      winRate: parseNumber(m[5]) / 100,
      play: parseNumber(m[6])
    })
  }
  return list
}

function parseAugmentGuideDesc(html) {
  const text = String(html || '')
  const match = text.match(/<section class="seo-guide-section"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/)
  if (!match) return ''
  const plain = cleanDesc(match[1])
  const parts = plain.split('。').map(x => x.trim()).filter(Boolean)
  if (parts.length < 2) return ''
  return parts.slice(1).find(x => !/如果|优先看|阵容/.test(x)) || ''
}

async function fetchMayhemTierList(force) {
  const now = Date.now()
  if (!force && aramListCache && now - aramListAt < CACHE_TTL) return aramListCache
  if (aramListPending) return aramListPending
  aramListPending = (async () => {
    const [manifest, html] = await Promise.all([
      fetchHexManifest(force),
      requestText(`${HEXDATA}/heroes`)
    ])
    const rows = parseHeroRows(html)
    if (!rows.length) throw new Error('Hexdata 英雄榜解析失败')
    const htmlInfo = parseHexdataMeta(html)
    if (htmlInfo.buildId && htmlInfo.buildId !== manifest.buildId) {
      throw new Error('Hexdata 英雄榜与 manifest 构建不一致')
    }
    const list = rows.map(row => ({
      championId: row.championId,
      slug: row.slug,
      play: row.play,
      winRate: row.winRate,
      pickRate: row.pickRate,
      kda: 0,
      tier: row.tier,
      rank: row.rank,
      tierText: tierLabel(row.tier),
      tierClass: tierClass(row.tier),
      winRateText: formatPercent(row.winRate),
      pickRateText: formatPercent(row.pickRate),
      playText: formatNumber(row.play),
      kdaText: '-'
    }))
    return { list, meta: manifest, patch: manifest.patch }
  })()
  try {
    const result = await aramListPending
    aramListCache = result
    aramListBuildId = result.meta && result.meta.buildId
    aramListAt = Date.now()
    return result
  } catch (e) {
    if (aramListCache) return aramListCache
    throw e
  } finally {
    aramListPending = null
  }
}

async function fetchAugments(force) {
  const now = Date.now()
  if (!force && augmentsCache && now - augmentsAt < CACHE_TTL) return augmentsCache
  if (augmentsPending) return augmentsPending
  augmentsPending = (async () => {
    if (!championMap) await initStaticData()
    const [manifest, html, jsonList] = await Promise.all([
      fetchHexManifest(force),
      requestText(`${HEXDATA}/augments`),
      request(`${HEXDATA}/data/augments.json`, {
        header: { Referer: `${HEXDATA}/augments` }
      }).catch(() => [])
    ])
    const cdragon = await resolveCdragonSource(manifest.patch)
    const [pools, clientAugs, arenaRes] = await Promise.all([
      request(`${cdragon.base}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/augment-lists.json`, { cache: true }),
      request(`${cdragon.base}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/cherry-augments.json`, { cache: true }),
      request(`${cdragon.base}/cdragon/arena/zh_cn.json`, { cache: true }).catch(() => ({ augments: [] }))
    ])
    const stats = parseAugmentRows(html)
    if (!stats.length) throw new Error('Hexdata 强化榜解析失败')
    const htmlInfo = parseHexdataMeta(html)
    if (htmlInfo.buildId && htmlInfo.buildId !== manifest.buildId) {
      throw new Error('Hexdata 强化榜与 manifest 构建不一致')
    }
    const kiwi = (pools || []).find(x => x.modeName === 'KIWI')
    if (!kiwi || !Array.isArray(kiwi.augmentList) || kiwi.augmentList.length < MIN_KIWI_POOL_SIZE) {
      throw new Error('CommunityDragon KIWI 强化池缺失或数量异常')
    }
    const poolKeys = {}
    ;((kiwi && kiwi.augmentList) || []).forEach(path => {
      poolKeys[String(path).split('/').pop().toLowerCase()] = true
    })
    const clientById = {}
    const clientByName = {}
    ;(clientAugs || []).forEach(a => {
      const key = String(a.augmentNameId || '').toLowerCase()
      if (!poolKeys[key]) return
      clientById[Number(a.id)] = a
      clientByName[String(a.nameTRA || '').trim()] = a
    })
    const arenaByName = {}
    ;((arenaRes && arenaRes.augments) || []).forEach(a => {
      arenaByName[String(a.name || '').trim()] = a
    })
    const jsonById = {}
    ;(Array.isArray(jsonList) ? jsonList : []).forEach(row => {
      jsonById[Number(row.id)] = row
    })
    const list = stats.map((stat, index) => {
      const extra = jsonById[stat.id] || {}
      const client = clientById[stat.id] || clientByName[stat.name] || {}
      const arena = arenaByName[stat.name] || {}
      const rarity = rarityFromClient(client.rarity) || rarityFromHexdata(extra.rarity)
      const rInfo = rarityInfo(rarity)
      const smallIcon = cdragonIcon(cdragon.base, client.augmentSmallIconPath) || absoluteUrl(HEXDATA, extra.iconUrl)
      const desc = cleanDesc(extra.description || arena.desc || arena.tooltip || '')
      const pickRate = Number(extra.pickRate) || 0
      const play = Number(extra.games) || 0
      const globalTier = Number(extra.tier) || tierFromRank(index, stats.length)
      return {
        id: stat.id,
        key: client.augmentNameId || stat.slug || String(stat.id),
        slug: stat.slug,
        name: stat.name,
        largeIcon: smallIcon,
        smallIcon,
        rarity,
        rarityName: rInfo.name,
        rarityKey: rInfo.key,
        rarityColor: rInfo.color,
        desc: desc || '当前国服统计已收录，效果说明等待静态资源补全。',
        tooltip: cleanDesc(extra.description || arena.tooltip || arena.desc || '') || desc,
        champions: [],
        globalTier,
        avgPerf: stat.score,
        avgPop: pickRate,
        pickRate,
        play,
        playText: play ? formatNumber(play) : '',
        pickRateText: pickRate ? formatPercent(pickRate) : '',
        winRate: stat.winRate,
        winRateText: formatPercent(stat.winRate),
        perfText: stat.score.toFixed(1),
        popText: pickRate ? formatPercent(pickRate) : '',
        tierText: tierLabel(globalTier),
        tierClass: tierClass(globalTier),
        source: manifest.source,
        patch: manifest.patch,
        dataDate: manifest.dataDate,
        buildId: manifest.buildId,
        cdragonVersion: cdragon.version,
        rarityRaw: client.rarity || ''
      }
    })
    const linked = list.filter(a => a.key && a.smallIcon && a.rarity).length
    if (linked / stats.length < MIN_AUGMENT_LINK_RATE) {
      throw new Error(`强化静态资源关联率过低: ${linked}/${stats.length}`)
    }
    return list.filter(a => a.rarity).map(a => meta.enrichAugment(a, championMap))
  })()
  try {
    const result = await augmentsPending
    if (!result.length) throw new Error('国服强化数据为空')
    augmentsCache = result
    augmentsBuildId = (result[0] && result[0].buildId) || ''
    augmentsAt = Date.now()
    return result
  } catch (e) {
    if (augmentsCache) return augmentsCache
    throw e
  } finally {
    augmentsPending = null
  }
}

async function getMayhemChampions(force) {
  const [, aram] = await Promise.all([
    initStaticData(force),
    fetchMayhemTierList(force)
  ])
  const merged = aram.list.map(row => {
    const c = championMap[row.championId]
    return c ? meta.enrichChampion(Object.assign({}, c, row)) : null
  }).filter(Boolean)
  merged.sort((a, b) => a.rank - b.rank)
  return {
    version: cachedVersion,
    patch: aram.patch || cachedVersion,
    meta: aram.meta,
    list: merged,
    stats: {
      heroes: merged.length,
      sss: merged.filter(x => x.grade === 'SSS').length,
      ss: merged.filter(x => x.grade === 'SS').length,
      builds: merged.length
    }
  }
}

function scoreAugmentForChampion(aug, champId) {
  const hit = (aug.champions || []).find(c => c.id === champId)
  if (hit) {
    return {
      matched: true,
      score: hit.score || hit.performance || 0,
      performance: hit.score || hit.performance || 0,
      popular: hit.pickRate || hit.popular || 0,
      fitTier: hit.tier || 1,
      winRate: hit.winRate || 0,
      play: hit.play || 0
    }
  }
  return {
    matched: false,
    score: (aug.avgPerf || 0) * 0.7,
    performance: aug.avgPerf || 0,
    popular: aug.avgPop || 0,
    fitTier: 9,
    winRate: aug.winRate || 0,
    play: 0
  }
}

function pickTopUnique(list, n) {
  const out = []
  const used = {}
  for (let i = 0; i < list.length && out.length < n; i++) {
    const a = list[i]
    if (!a || used[a.key]) continue
    used[a.key] = true
    out.push(a)
  }
  return out
}

function buildCombos(scored) {
  const matched = scored.filter(a => a.matched)
  const pool = matched.length >= 3 ? matched : scored.filter(a => a.matched || a.score >= 55)
  const silver = pool.filter(a => a.rarity === 1)
  const gold = pool.filter(a => a.rarity === 4)
  const prism = pool.filter(a => a.rarity === 8)
  const drafts = [
    { id: 'best', title: '综合优先', tip: '按该英雄 HexScore 依次选择', cards: pickTopUnique(pool, 4) },
    { id: 'prism', title: '棱彩优先', tip: '先锁高分棱彩，再用金银补齐', cards: pickTopUnique(prism.concat(gold, silver), 4) },
    { id: 'gold', title: '黄金核心', tip: '优先高分黄金，兼顾获取概率', cards: pickTopUnique(gold.concat(prism, silver), 4) },
    { id: 'silver', title: '白银过渡', tip: '以高分白银和黄金平稳过渡', cards: pickTopUnique(silver.concat(gold, prism), 4) }
  ]
  const seen = {}
  return drafts.filter(c => c.cards.length >= 2).filter(c => {
    const key = c.cards.map(x => x.key).sort().join('|')
    if (seen[key]) return false
    seen[key] = true
    return true
  }).map(c => {
    const avg = c.cards.reduce((sum, x) => sum + (x.score || 0), 0) / c.cards.length
    const avgPop = c.cards.reduce((sum, x) => sum + (x.popular || 0), 0) / c.cards.length
    return Object.assign({}, c, {
      avgPerf: avg,
      avgPerfText: avg.toFixed(1),
      avgPopText: avgPop ? formatPercent(avgPop) : '-',
      matchedCount: c.cards.filter(x => x.matched).length,
      strengthText: avg.toFixed(1),
      cardCount: c.cards.length
    })
  }).sort((a, b) => b.avgPerf - a.avgPerf)
    .map((c, index) => Object.assign({}, c, { rank: index + 1 }))
    .slice(0, 4)
}

function buildChampionAugmentPlan(augments, champId) {
  const scored = augments.map(a => {
    const s = scoreAugmentForChampion(a, champId)
    return Object.assign({}, a, {
      matched: s.matched,
      score: s.score,
      performance: s.performance,
      popular: s.popular,
      play: s.play,
      winRate: s.winRate || a.winRate,
      winRateText: formatPercent(s.winRate || a.winRate),
      perfText: s.performance ? Number(s.performance).toFixed(1) : '-',
      popText: s.popular ? formatPercent(s.popular) : '-',
      fitTier: s.fitTier,
      fitTierText: s.matched ? '国服适配' : a.tierText,
      fitTierClass: s.matched ? 'tier-s' : a.tierClass
    })
  }).sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1
    return b.score - a.score
  })
  const matchedList = scored.filter(a => a.matched)
  const suited = matchedList.slice(0, 12)
  return {
    suited,
    matchedList,
    combos: buildCombos(scored),
    byRarity: {
      all: suited,
      silver: suited.filter(a => a.rarity === 1),
      gold: suited.filter(a => a.rarity === 4),
      prismatic: suited.filter(a => a.rarity === 8)
    },
    allScored: scored
  }
}

async function getChampionAugments(championKeyOrId, force) {
  if (!cachedChampions) await initStaticData(force)
  const [augments, tier] = await Promise.all([fetchAugments(force), fetchMayhemTierList(force)])
  const champ = /^\d+$/.test(String(championKeyOrId))
    ? championMap[Number(championKeyOrId)]
    : championMap[String(championKeyOrId).toLowerCase()]
  if (!champ) throw new Error('未找到英雄')
  const stats = (tier.list || []).find(x => x.championId === champ.key) || null
  const globalById = {}
  augments.forEach(a => { globalById[Number(a.id)] = a })
  let championAugments = []
  const heroPath = heroPublicPath(champ, stats)
  try {
    const payload = await request(`${HEXDATA}/data/heroes/${champ.key}.json`, {
      timeout: 30000,
      header: { Referer: `${HEXDATA}${heroPath}` }
    })
    const confirmedManifest = await fetchHexManifest(true)
    if (confirmedManifest.buildId !== tier.meta.buildId) {
      throw new Error('Hexdata 英雄详情读取期间构建已更新')
    }
    if (!payload || !Array.isArray(payload.augments) || !payload.augments.length) {
      throw new Error('Hexdata 英雄详情为空')
    }
    championAugments = parseChampionAugmentJson(payload, champ, globalById, stats && stats.play)
      .map(a => meta.enrichAugment(a, championMap))
  } catch (e) {
    console.error('Hexdata champion detail failed', champ.key, e)
    try {
      const html = await requestText(`${HEXDATA}${heroPath}`)
      const htmlInfo = parseHexdataMeta(html)
      if (htmlInfo.buildId && htmlInfo.buildId !== tier.meta.buildId) {
        throw new Error('Hexdata 英雄页与 manifest 构建不一致')
      }
      const rows = parseChampionAugmentTable(html, stats && stats.play)
      if (!rows.length) throw new Error('Hexdata 英雄公开页解析失败')
      championAugments = parseChampionAugmentJson({ augments: rows }, champ, globalById, stats && stats.play)
        .map(a => meta.enrichAugment(a, championMap))
    } catch (e2) {
      console.error('Hexdata champion html fallback failed', champ.key, e2)
    }
  }
  const plan = buildChampionAugmentPlan(championAugments, champ.key)
  return {
    version: cachedVersion,
    patch: tier.patch || cachedVersion,
    source: 'Hexdata 国服 Queue 2400 样本',
    champion: champ,
    stats: stats ? meta.enrichChampion(Object.assign({}, champ, stats)) : null,
    suited: plan.suited,
    matchedList: plan.matchedList,
    combos: plan.combos,
    byRarity: plan.byRarity,
    totalAugments: augments.length,
    matchedCount: plan.matchedList.length
  }
}

async function getAugmentTierList(force) {
  const list = await fetchAugments(force)
  const core = list.filter(a => (a.tags || []).some(t => t.key === 'core')).length
  const special = list.filter(a => (a.tags || []).some(t => t.key === 'special')).length
  const trap = list.filter(a => (a.tags || []).some(t => t.key === 'trap')).length
  return {
    version: cachedVersion || await getLatestVersion(force),
    total: list.length,
    list,
    stats: { total: list.length, core, special, trap },
    groups: [
      { rarity: 8, name: '棱彩', key: 'prismatic', list: list.filter(a => a.rarity === 8) },
      { rarity: 4, name: '黄金', key: 'gold', list: list.filter(a => a.rarity === 4) },
      { rarity: 1, name: '白银', key: 'silver', list: list.filter(a => a.rarity === 1) }
    ]
  }
}

async function getAugmentDetail(keyOrId, force) {
  const list = await fetchAugments(force)
  const aug = list.find(a => a.key === keyOrId || String(a.id) === String(keyOrId))
  if (!aug) throw new Error('未找到强化')
  let heroRows = []
  let detailMeta = null
  if (aug.slug) {
    try {
      const html = await requestText(`${HEXDATA}/augment/${aug.id}-${aug.slug}`)
      heroRows = parseAugmentHeroes(html)
      const desc = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1] || ''
      const pick = (desc.match(/选取率\s*([0-9.]+)%/) || [])[1]
      const play = (desc.match(/样本\s*([0-9,]+)\s*场/) || [])[1]
      detailMeta = {
        pickRate: parseNumber(pick) / 100,
        play: parseNumber(play),
        desc: parseAugmentGuideDesc(html)
      }
    } catch (e) {}
  }
  const heroes = heroRows.map(row => {
    const champ = championMap && championMap[row.id]
    return {
      id: row.id,
      name: champ ? champ.name : row.name,
      icon: champ ? champ.icon : '',
      winRateText: formatPercent(row.winRate),
      pickRateText: formatNumber(row.play) + ' 场',
      scoreText: row.score.toFixed(1)
    }
  })
  const detailAug = Object.assign({}, aug, detailMeta ? {
    avgPop: detailMeta.pickRate,
    popText: formatPercent(detailMeta.pickRate),
    play: detailMeta.play,
    playText: formatNumber(detailMeta.play),
    desc: detailMeta.desc || aug.desc,
    tooltip: detailMeta.desc || aug.tooltip || aug.desc
  } : {})
  const related = list.filter(a => a.key !== aug.key && a.rarity === aug.rarity)
    .map(a => {
      const sameStyle = (a.styleKeys || []).some(k => (aug.styleKeys || []).indexOf(k) >= 0)
      return Object.assign({}, a, { _rel: (sameStyle ? 30 : 0) + (a.avgPerf || 0) * 0.5 })
    })
    .sort((a, b) => b._rel - a._rel)
    .slice(0, 8)
  return { version: cachedVersion, augment: detailAug, related, heroes, stages: [] }
}

async function getItems(force) {
  const now = Date.now()
  if (!force && itemsCache && now - itemsAt < CACHE_TTL) return itemsCache
  if (itemsPending) return itemsPending
  itemsPending = (async () => {
    const version = cachedVersion || await getLatestVersion(force)
    const res = await request(`${DDRAGON}/cdn/${version}/data/zh_CN/item.json`, { cache: true })
    const data = res.data || {}
    const list = []
    Object.keys(data).forEach(id => {
      const it = data[id]
      if (!it || (it.maps && it.maps['12'] === false)) return
      if (it.into && it.into.length) return
      if (!it.gold || !it.gold.purchasable) return
      if ((it.gold.total || 0) < 2000 && !(it.tags || []).includes('Boots')) return
      const cat = meta.classifyItem(it)
      if (cat === 'trinket') return
      const colloq = String(it.colloq || '').replace(/;/g, ' ')
      list.push({
        id,
        name: it.name,
        plaintext: it.plaintext || '',
        description: stripHtml(it.description),
        icon: `${DDRAGON}/cdn/${version}/img/item/${id}.png`,
        price: it.gold.total || 0,
        tags: it.tags || [],
        cat,
        catLabel: ({ boots: '鞋子', crit: '暴击', ap: '法强', ad: '攻击', tank: '坦克', vamp: '吸血', other: '其它' })[cat] || '其它',
        searchText: [it.name, it.plaintext, colloq, id].join(' ').toLowerCase()
      })
    })
    list.sort((a, b) => b.price - a.price)
    return {
      version,
      list,
      cats: [
        { key: 'all', label: '全部' },
        { key: 'ad', label: '攻击' },
        { key: 'ap', label: '法强' },
        { key: 'crit', label: '暴击' },
        { key: 'tank', label: '坦克' },
        { key: 'vamp', label: '吸血' },
        { key: 'boots', label: '鞋子' },
        { key: 'other', label: '其它' }
      ]
    }
  })()
  try {
    const result = await itemsPending
    itemsCache = result
    itemsAt = Date.now()
    return result
  } finally {
    itemsPending = null
  }
}

async function getGeneralLoadouts(force) {
  const list = await fetchAugments(force)
  const loadouts = meta.buildGeneralLoadouts(list)
  return { version: cachedVersion, loadouts, total: loadouts.length }
}

async function getHomeSummary(force) {
  const [champsRes, augsRes] = await Promise.allSettled([
    getMayhemChampions(force),
    getAugmentTierList(force)
  ])
  if (champsRes.status !== 'fulfilled' && augsRes.status !== 'fulfilled') {
    throw (champsRes.reason || augsRes.reason || new Error('首页数据加载失败'))
  }
  const champs = champsRes.status === 'fulfilled'
    ? champsRes.value
    : { patch: '', version: cachedVersion, meta: null, list: [], stats: { heroes: 0, sss: 0, ss: 0, builds: 0 } }
  const augs = augsRes.status === 'fulfilled'
    ? augsRes.value
    : { list: [], stats: { total: 0, core: 0, special: 0, trap: 0 } }
  if (champsRes.status !== 'fulfilled') console.error('heroes load failed', champsRes.reason)
  if (augsRes.status !== 'fulfilled') console.error('augments load failed', augsRes.reason)
  return {
    patch: champs.patch,
    version: champs.version,
    meta: champs.meta,
    summary: {
      heroes: champs.stats.heroes,
      augments: augs.stats.total,
      core: augs.stats.core,
      special: augs.stats.special,
      trap: augs.stats.trap,
      sss: champs.stats.sss
    },
    champions: champs.list,
    augments: augs.list
  }
}

module.exports = {
  initStaticData,
  getMayhemChampions,
  getChampionAugments,
  getAugmentTierList,
  getAugmentDetail,
  getItems,
  getGeneralLoadouts,
  getHomeSummary,
  fetchAugments,
  RARITY_MAP,
  ROLE_TABS: meta.ROLE_TABS,
  RARITY_TABS: meta.RARITY_TABS
}
