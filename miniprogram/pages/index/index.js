const api = require('../../utils/api')
const { debounce } = require('../../utils/util')
const backTop = require('../../behaviors/back-top')

const MAIN_TABS = [
  { key: 'heroes', label: '英雄' },
  { key: 'augments', label: '强化' },
  { key: 'loadouts', label: '搭配' },
  { key: 'items', label: '装备' }
]

const PLACEHOLDERS = {
  heroes: '中文/外号/拼音，如 剑圣 或 js',
  augments: '搜索强化名或效果',
  items: '搜索装备',
  loadouts: '搜索搭配'
}

Page({
  behaviors: [backTop],
  data: {
    loading: true,
    summary: null,
    keyword: '',
    searchPlaceholder: PLACEHOLDERS.heroes,
    mainTabs: MAIN_TABS,
    mainTab: 'heroes',

    roleTabs: api.ROLE_TABS,
    role: 'all',
    heroSort: 'rank',
    heroGrid: true,
    heroes: [],
    heroCount: 0,

    rarityTabs: api.RARITY_TABS,
    augRarity: 'all',
    augTag: '',
    augSort: 'perf',
    showTips: false,
    augments: [],
    augCount: 0,

    itemCats: [],
    itemCat: 'all',
    items: [],
    itemCount: 0,

    loadouts: [],
    loadoutCount: 0
  },

  onLoad() {
    this._allHeroes = []
    this._allAugs = []
    this._allItems = []
    this._allLoadouts = []
    this.bootstrap()
  },

  onPageScroll(e) {
    const show = (e.scrollTop || 0) > 240
    if (show !== this.data.showBackTop) this.setData({ showBackTop: show })
  },

  onPullDownRefresh() {
    this.bootstrap(true).finally(() => wx.stopPullDownRefresh())
  },

  async bootstrap(force) {
    this.setData({ loading: true })
    try {
      const app = getApp()
      if (force) await app.startBootstrap(true)
      else await app.ensureReady()
      const champs = await api.getMayhemChampions(force)
      this._allHeroes = champs.list || []
      if (force) {
        this._allAugs = []
        this._allItems = []
        this._allLoadouts = []
      }
      const prev = this.data.summary || {}
      this.setData({
        loading: false,
        summary: {
          heroes: champs.stats.heroes,
          augments: force ? 0 : (prev.augments || 0),
          core: force ? 0 : (prev.core || 0),
          special: force ? 0 : (prev.special || 0),
          trap: force ? 0 : (prev.trap || 0),
          sss: champs.stats.sss
        }
      })
      this.applyHeroes()
      this.ensureAugs(force)
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  ensureAugs(force) {
    if (this._augsPending) return this._augsPending
    if (!force && this._allAugs.length) return Promise.resolve()
    this._augsPending = api.getAugmentTierList(force).then(augs => {
      this._allAugs = augs.list || []
      const s = this.data.summary || {}
      this.setData({
        summary: {
          heroes: s.heroes || 0,
          augments: augs.stats.total,
          core: augs.stats.core,
          special: augs.stats.special,
          trap: augs.stats.trap,
          sss: s.sss || 0
        }
      })
      if (this.data.mainTab === 'augments') this.applyAugs()
    }).catch(e => console.error(e)).finally(() => {
      this._augsPending = null
    })
    return this._augsPending
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value || '' })
    this.debouncedApply()
  },

  debouncedApply: debounce(function () {
    this.applyCurrent()
  }, 180),

  onMainTab(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.mainTab) return
    this.setData({
      mainTab: key,
      keyword: '',
      searchPlaceholder: PLACEHOLDERS[key] || '搜索',
      augTag: ''
    })
    this.applyCurrent()
    if (key === 'augments') this.ensureAugs()
    if (key === 'items' && !this._allItems.length) {
      api.getItems().then(res => {
        this._allItems = res.list || []
        this.setData({ itemCats: res.cats || [] })
        this.applyItems()
      }).catch(() => {})
    }
    if (key === 'loadouts' && !this._allLoadouts.length) {
      api.getGeneralLoadouts().then(res => {
        this._allLoadouts = res.loadouts || []
        this.applyLoadouts()
      }).catch(() => {})
    }
  },

  applyCurrent() {
    const t = this.data.mainTab
    if (t === 'heroes') this.applyHeroes()
    else if (t === 'augments') this.applyAugs()
    else if (t === 'items') this.applyItems()
    else if (t === 'loadouts') this.applyLoadouts()
  },

  onRole(e) {
    this.setData({ role: e.currentTarget.dataset.key })
    this.applyHeroes()
  },

  onHeroSort(e) {
    this.setData({ heroSort: e.currentTarget.dataset.key })
    this.applyHeroes()
  },

  toggleHeroView() {
    this.setData({ heroGrid: !this.data.heroGrid })
  },

  applyHeroes() {
    const { role, heroSort, keyword } = this.data
    const kw = (keyword || '').trim().toLowerCase().replace(/\s+/g, '')
    let list = (this._allHeroes || []).slice()
    if (role && role !== 'all') {
      list = list.filter(h => (h.tags || []).indexOf(role) >= 0 || h.role === role)
    }
    if (kw) {
      list = list.filter(h => {
        const t = (h.searchText || '').replace(/\s+/g, '')
        return t.indexOf(kw) >= 0 || (h.searchText || '').indexOf(keyword.trim().toLowerCase()) >= 0
      })
    }
    list.sort((a, b) => {
      if (heroSort === 'winRate') return (b.winRate || 0) - (a.winRate || 0)
      if (heroSort === 'pickRate') return (b.pickRate || 0) - (a.pickRate || 0)
      if (heroSort === 'play') return (b.play || 0) - (a.play || 0)
      return (a.rank || 999) - (b.rank || 999)
    })
    const slim = list.map(item => {
      let metricText = item.winRateText
      if (heroSort === 'pickRate') metricText = item.pickRateText
      else if (heroSort === 'play') metricText = item.playText
      return {
        id: item.id,
        key: item.key,
        name: item.name,
        title: item.title,
        icon: item.icon,
        grade: item.grade,
        gradeClass: item.gradeClass,
        rank: item.rank,
        roleLabel: item.roleLabel,
        winRateText: item.winRateText,
        pickRateText: item.pickRateText,
        playText: item.playText,
        metricText
      }
    })
    if (this._heroPaintTimer) {
      clearTimeout(this._heroPaintTimer)
      this._heroPaintTimer = null
    }
    const first = 40
    if (slim.length > first && !kw && role === 'all') {
      this.setData({ heroes: slim.slice(0, first), heroCount: slim.length })
      this._heroPaintTimer = setTimeout(() => {
        this._heroPaintTimer = null
        if (this.data.mainTab !== 'heroes') return
        this.setData({ heroes: slim })
      }, 64)
    } else {
      this.setData({ heroes: slim, heroCount: slim.length })
    }
  },

  onAugRarity(e) {
    this.setData({ augRarity: e.currentTarget.dataset.key || 'all', augTag: '', showTips: false })
    this.applyAugs()
  },

  onAugTag(e) {
    const key = e.currentTarget.dataset.key
    const next = this.data.augTag === key ? '' : key
    this.setData({ augTag: next, showTips: false })
    this.applyAugs()
  },

  onAugSort(e) {
    this.setData({ augSort: e.currentTarget.dataset.key })
    this.applyAugs()
  },

  applyAugs() {
    const { augRarity, augTag, augSort, keyword } = this.data
    const kw = (keyword || '').trim().toLowerCase()
    let list = (this._allAugs || []).slice()
    if (augRarity === 'prismatic') list = list.filter(a => a.rarity === 8)
    if (augRarity === 'gold') list = list.filter(a => a.rarity === 4)
    if (augRarity === 'silver') list = list.filter(a => a.rarity === 1)
    if (augTag && augTag !== 'tips') {
      list = list.filter(a => (a.tags || []).some(t => t.key === augTag))
    }
    if (kw) {
      list = list.filter(a =>
        (a.name && a.name.toLowerCase().indexOf(kw) >= 0) ||
        (a.desc && a.desc.toLowerCase().indexOf(kw) >= 0) ||
        (a.key && a.key.toLowerCase().indexOf(kw) >= 0) ||
        (a.styleKeys || []).some(s => s.indexOf(kw) >= 0)
      )
    }
    const gradeScore = { SSS: 6, SS: 5, S: 4, A: 3, B: 2, C: 1 }
    list.sort((a, b) => {
      if (augSort === 'pop') return (b.avgPop || 0) - (a.avgPop || 0)
      if (augSort === 'grade') return (gradeScore[b.grade] || 0) - (gradeScore[a.grade] || 0)
      return (b.avgPerf || 0) - (a.avgPerf || 0)
    })
    this.setData({ augments: list, augCount: list.length })
  },

  onItemCat(e) {
    this.setData({ itemCat: e.currentTarget.dataset.key })
    this.applyItems()
  },

  applyItems() {
    const { itemCat, keyword } = this.data
    const kw = (keyword || '').trim().toLowerCase()
    let list = (this._allItems || []).slice()
    if (itemCat && itemCat !== 'all') list = list.filter(i => i.cat === itemCat)
    if (kw) list = list.filter(i => (i.searchText || '').indexOf(kw) >= 0)
    this.setData({ items: list.slice(0, 80), itemCount: list.length })
  },

  applyLoadouts() {
    const kw = (this.data.keyword || '').trim().toLowerCase()
    let list = (this._allLoadouts || []).slice()
    if (kw) {
      list = list.filter(l =>
        (l.name && l.name.toLowerCase().indexOf(kw) >= 0) ||
        (l.desc && l.desc.toLowerCase().indexOf(kw) >= 0)
      )
    }
    this.setData({ loadouts: list, loadoutCount: list.length })
  },

  goChamp(e) {
    const { id, key, name } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}&key=${key}&name=${encodeURIComponent(name || '')}`
    })
  },

  goAug(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.navigateTo({
      url: `/pages/augment-detail/augment-detail?key=${encodeURIComponent(key)}`
    })
  }
})
