const api = require('../../utils/api')
const { formatPercent, tierLabel, tierClass } = require('../../utils/util')
const backTop = require('../../behaviors/back-top')

Page({
  behaviors: [backTop],
  data: {
    loading: true,
    champion: null,
    stats: null,
    combos: [],
    suited: [],
    displayList: [],
    matchedCount: 0,
    suitedCount: 0,
    filter: 'all',
    sortKey: 'score',
    filterTabs: [
      { key: 'all', label: '全部' },
      { key: 'prismatic', label: '棱彩' },
      { key: 'gold', label: '黄金' },
      { key: 'silver', label: '白银' }
    ]
  },

  onLoad(query) {
    this.champId = query.id || ''
    this.champKey = query.key || ''
    const name = query.name ? decodeURIComponent(query.name) : ''
    if (name) wx.setNavigationBarTitle({ title: name + ' · 强化选牌' })
    this._suited = []
    this.bootstrap()
  },

  onPageScroll(e) {
    const show = (e.scrollTop || 0) > 240
    if (show !== this.data.showBackTop) this.setData({ showBackTop: show })
  },

  async bootstrap(force) {
    this.setData({ loading: true })
    try {
      const app = getApp()
      await app.ensureReady()
      const res = await api.getChampionAugments(this.champId || this.champKey, force)

      let statsView = null
      if (res.stats) {
        const meta = require('../../utils/meta')
        const g = meta.gradeFromChamp(res.stats.winRate, res.stats.rank)
        statsView = {
          winRateText: res.stats.winRateText || formatPercent(res.stats.winRate),
          tierText: res.stats.tierText || tierLabel(res.stats.tier),
          tierClass: res.stats.tierClass || tierClass(res.stats.tier),
          grade: res.stats.grade || g.grade,
          gradeClass: res.stats.gradeClass || g.gradeClass
        }
      }

      this._suited = (res.suited || []).map(a => Object.assign({}, a, {
        key: a.key || String(a.id),
        largeIcon: a.largeIcon || a.smallIcon || a.icon,
        smallIcon: a.smallIcon || a.icon
      }))
      this.setData({
        loading: false,
        champion: res.champion,
        stats: statsView || (res.stats ? {
          winRateText: res.stats.winRateText,
          tierText: res.stats.tierText,
          tierClass: res.stats.tierClass,
          grade: res.stats.grade,
          gradeClass: res.stats.gradeClass
        } : null),
        combos: res.combos || [],
        suited: this._suited,
        matchedCount: res.matchedCount || 0,
        suitedCount: this._suited.length,
        filter: 'all',
        sortKey: 'score'
      })
      this.applyList()
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onFilter(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.filter) return
    this.setData({ filter: key })
    this.applyList()
  },

  onSort(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.sortKey) return
    this.setData({ sortKey: key })
    this.applyList()
  },

  applyList() {
    const { filter, sortKey } = this.data
    let list = (this._suited || []).slice()
    if (filter === 'prismatic') list = list.filter(a => a.rarity === 8)
    if (filter === 'gold') list = list.filter(a => a.rarity === 4)
    if (filter === 'silver') list = list.filter(a => a.rarity === 1)

    list.sort((a, b) => {
      if (sortKey === 'popular') return (b.pickRate || b.popular || 0) - (a.pickRate || a.popular || 0)
      if (sortKey === 'rarity') {
        if (b.rarity !== a.rarity) return b.rarity - a.rarity
        return (b.winRate || b.score || 0) - (a.winRate || a.score || 0)
      }
      return (b.score || 0) - (a.score || 0)
    })

    this.setData({ displayList: list })
  },

  reload() {
    this.bootstrap(true)
  }
})
