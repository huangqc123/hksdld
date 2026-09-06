const api = require('../../utils/api')
const { debounce } = require('../../utils/util')

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

  onPullDownRefresh() {
    this.bootstrap(true).finally(() => wx.stopPullDownRefresh())
  },

  async bootstrap(force) {
    this.setData({ loading: true })
    try {
      const app = getApp()
      if (force) await app.startBootstrap(true)
      else await app.ensureReady()
      const home = await api.getHomeSummary(force)
      this._allHeroes = home.champions || []
      this._allAugs = home.augments || []

      Promise.all([
        api.getItems(force).catch(() => ({ list: [], cats: [] })),
        api.getGeneralLoadouts(force).catch(() => ({ loadouts: [] }))
      ]).then(([itemsRes, loadRes]) => {
        this._allItems = itemsRes.list || []
        this._allLoadouts = loadRes.loadouts || []
        this.setData({
          itemCats: itemsRes.cats || [{ key: 'all', label: '全部' }],
          loadoutCount: this._allLoadouts.length
        })
        if (this.data.mainTab === 'items') this.applyItems()
        if (this.data.mainTab === 'loadouts') this.applyLoadouts()
      })

      this.setData({
        loading: false,
        summary: home.summary
      })
      this.applyHeroes()
      this.applyAugs()
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
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
    if (key === 'items' && !this._allItems.length) {
      api.getItems().then(res => {
        this._allItems = res.list || []
        this.setData({ itemCats: res.cats || [] })
        this.applyItems()
      })
    }
    if (key === 'loadouts' && !this._allLoadouts.length) {
      api.getGeneralLoadouts().then(res => {
        this._allLoadouts = res.loadouts || []
        this.applyLoadouts()
      })
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
    list = list.map(item => {
      let metricText = item.winRateText
      if (heroSort === 'pickRate') metricText = item.pickRateText
      else if (heroSort === 'play') metricText = item.playText
      return Object.assign({}, item, { metricText })
    })
    this.setData({ heroes: list, heroCount: list.length })
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
