const { tierLabel, tierClass, formatPercent, formatNumber } = require('./util')

const ROLE_TABS = [
  { key: 'all', label: '全部' },
  { key: 'Fighter', label: '战士' },
  { key: 'Mage', label: '法师' },
  { key: 'Tank', label: '坦克' },
  { key: 'Assassin', label: '刺客' },
  { key: 'Marksman', label: '射手' },
  { key: 'Support', label: '辅助' }
]

const RARITY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'prismatic', label: '棱彩', rarity: 8 },
  { key: 'gold', label: '黄金', rarity: 4 },
  { key: 'silver', label: '白银', rarity: 1 }
]

function gradeFromChamp(winRate, rank) {
  const wr = Number(winRate) || 0
  const r = Number(rank) || 999
  if (wr >= 0.56 || r <= 10) return { grade: 'SSS', gradeClass: 'g-sss' }
  if (wr >= 0.54 || r <= 25) return { grade: 'SS', gradeClass: 'g-ss' }
  if (wr >= 0.52 || r <= 45) return { grade: 'S', gradeClass: 'g-s' }
  if (wr >= 0.50 || r <= 80) return { grade: 'A', gradeClass: 'g-a' }
  if (wr >= 0.48) return { grade: 'B', gradeClass: 'g-b' }
  return { grade: 'C', gradeClass: 'g-c' }
}

function gradeFromAugment(perf, pop, tier) {
  const p = Number(perf) || 0
  const t = tier == null ? 9 : Number(tier)
  if (t <= 1 || p >= 78) return { grade: 'SSS', gradeClass: 'g-sss' }
  if (t <= 2 || p >= 70) return { grade: 'SS', gradeClass: 'g-ss' }
  if (t <= 3 || p >= 60) return { grade: 'S', gradeClass: 'g-s' }
  if (t <= 4 || p >= 52) return { grade: 'A', gradeClass: 'g-a' }
  if (p >= 45) return { grade: 'B', gradeClass: 'g-b' }
  return { grade: 'C', gradeClass: 'g-c' }
}

/** 强化标签：核心 / 特殊 / 冷门 / 陷阱 */
function tagAugment(aug) {
  const perf = Number(aug.avgPerf || aug.performance || 0)
  const pop = Number(aug.avgPop || aug.popular || 0)
  const tier = aug.globalTier
  const tags = []
  if (perf >= 70) tags.push({ key: 'core', label: '核心', cls: 'tag-core' })
  else if (perf >= 62) tags.push({ key: 'special', label: '特殊', cls: 'tag-special' })
  else if (perf >= 55) tags.push({ key: 'solid', label: '优质', cls: 'tag-solid' })
  if (perf < 42) tags.push({ key: 'trap', label: '谨慎', cls: 'tag-trap' })
  if (tier != null && tier <= 1) tags.push({ key: 't1', label: 'T' + (tier + 0 === 0 ? '0' : tier), cls: 'tag-t' })
  if (!tags.length) tags.push({ key: 'normal', label: '常规', cls: 'tag-normal' })
  return tags
}

function styleKeywords(desc) {
  const d = String(desc || '')
  const keys = []
  if (/暴击|会心/.test(d)) keys.push('暴击')
  if (/法术强度|法强|法术伤害/.test(d)) keys.push('法强')
  if (/攻击力|物理伤害/.test(d)) keys.push('攻击')
  if (/攻击速度|攻速/.test(d)) keys.push('攻速')
  if (/生命值|护甲|魔抗|承伤|坦克|治疗/.test(d)) keys.push('坦克')
  if (/移动速度|移速/.test(d)) keys.push('移速')
  if (/冷却|技能急速|冷却缩减/.test(d)) keys.push('冷却')
  if (/护盾|治疗|回复/.test(d)) keys.push('续航')
  if (/召唤|宠物|单位/.test(d)) keys.push('召唤')
  return keys
}

function buildAugmentTip(aug) {
  const tags = (aug.tags || []).map(t => t.label)
  const styles = aug.styleKeys || []
  const parts = []
  if (tags.indexOf('核心') >= 0) parts.push('高强度核心强化，适合作为优先锁定目标。')
  if (tags.indexOf('特殊') >= 0) parts.push('强度高但出现率偏低，刷到可优先考虑。')
  if (tags.indexOf('陷阱') >= 0) parts.push('热度不低但表现偏差，谨慎选择，别跟风。')
  if (tags.indexOf('冷门强') >= 0) parts.push('冷门但数据漂亮，懂的都懂。')
  if (styles.length) parts.push('偏向：' + styles.join(' / ') + '。')
  if (aug.topChampNames) parts.push('强势英雄：' + aug.topChampNames + '。')
  if (!parts.length) parts.push(aug.desc || '暂无额外 tip。')
  return parts.join(' ')
}

/** 通用流派搭配（基于描述关键词 + 高表现强化） */
function buildGeneralLoadouts(augments) {
  const defs = [
    { id: 'crit', name: '暴击输出', desc: '吃暴击、攻速与爆发的强化', match: a => /暴击|会心|攻速/.test(a.desc || '') },
    { id: 'ap', name: '法强轰炸', desc: '法强、技能伤害与冷却向', match: a => /法术强度|法强|技能|冷却|法术伤害/.test(a.desc || '') },
    { id: 'ad', name: '物理刺杀', desc: '攻击力、物理穿透向', match: a => /攻击力|物理|穿透|攻击速度/.test(a.desc || '') },
    { id: 'tank', name: '坦克承伤', desc: '生命、双抗、续航向', match: a => /生命值|护甲|魔抗|承伤|治疗|护盾/.test(a.desc || '') },
    { id: 'utility', name: '功能工具', desc: '移速、控制、召唤与功能', match: a => /移动|控制|召唤|护盾|视野/.test(a.desc || '') }
  ]
  return defs.map(def => {
    const cards = augments
      .filter(def.match)
      .slice()
      .sort((a, b) => (b.avgPerf || 0) - (a.avgPerf || 0))
      .slice(0, 8)
    const avg = cards.length
      ? cards.reduce((s, x) => s + (x.avgPerf || 0), 0) / cards.length
      : 0
    return {
      id: def.id,
      name: def.name,
      desc: def.desc,
      cards,
      count: cards.length,
      avgPerfText: avg ? avg.toFixed(1) : '-',
      silver: cards.filter(c => c.rarity === 1).length,
      gold: cards.filter(c => c.rarity === 4).length,
      prismatic: cards.filter(c => c.rarity === 8).length
    }
  }).filter(x => x.count >= 3)
}

function enrichAugment(aug, championMap) {
  const tags = tagAugment(aug)
  const styleKeys = styleKeywords(aug.desc)
  const g = gradeFromAugment(aug.avgPerf, aug.avgPop, aug.globalTier)
  const topChampNames = (aug.champions || []).slice(0, 5).map(c => {
    const ch = championMap && (championMap[c.id] || championMap[String(c.id)])
    return ch ? ch.name : ''
  }).filter(Boolean).join(' / ')
  const enriched = Object.assign({}, aug, {
    tags,
    styleKeys,
    grade: g.grade,
    gradeClass: g.gradeClass,
    topChampNames,
    tierText: aug.tierText || tierLabel(aug.globalTier),
    tierClass: aug.tierClass || tierClass(aug.globalTier)
  })
  enriched.tip = buildAugmentTip(enriched)
  return enriched
}

function enrichChampion(row) {
  const g = gradeFromChamp(row.winRate, row.rank)
  const role = (row.tags && row.tags[0]) || 'Fighter'
  const roleLabel = ({
    Fighter: '战士', Mage: '法师', Tank: '坦克',
    Assassin: '刺客', Marksman: '射手', Support: '辅助'
  })[role] || '其它'
  return Object.assign({}, row, {
    grade: g.grade,
    gradeClass: g.gradeClass,
    role,
    roleLabel,
    winRateText: row.winRateText || formatPercent(row.winRate),
    pickRateText: row.pickRateText || formatPercent(row.pickRate),
    playText: row.playText || formatNumber(row.play)
  })
}

/** 装备分类（ARAM 常用传说） */
function classifyItem(item) {
  const tags = item.tags || []
  const name = item.name || ''
  const desc = item.description || ''
  if (tags.indexOf('Boots') >= 0 || /靴|鞋/.test(name)) return 'boots'
  if (tags.indexOf('Trinket') >= 0) return 'trinket'
  if (/暴击|会心|Infinity|暴击/.test(name + desc) || tags.indexOf('CriticalStrike') >= 0) return 'crit'
  if (tags.indexOf('SpellDamage') >= 0 || /法术强度/.test(desc)) return 'ap'
  if (tags.indexOf('Damage') >= 0 || tags.indexOf('AttackSpeed') >= 0) return 'ad'
  if (tags.indexOf('Health') >= 0 || tags.indexOf('Armor') >= 0 || tags.indexOf('SpellBlock') >= 0) return 'tank'
  if (tags.indexOf('SpellVamp') >= 0 || tags.indexOf('LifeSteal') >= 0 || /吸血|全能|.吸取/.test(desc)) return 'vamp'
  return 'other'
}

module.exports = {
  ROLE_TABS,
  RARITY_TABS,
  gradeFromChamp,
  gradeFromAugment,
  tagAugment,
  styleKeywords,
  buildAugmentTip,
  buildGeneralLoadouts,
  enrichAugment,
  enrichChampion,
  classifyItem
}
