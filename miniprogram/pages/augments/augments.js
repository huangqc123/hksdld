const api = require('../../utils/api')
const { debounce } = require('../../utils/util')

Page({
  data: {
    loading: true,
    keyword: '',
    tab: 'all',
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'prismatic', label: '棱彩' },
      { key: 'gold', label: '黄金' },
      { key: 'silver', label: '白银' }
    ],
    allList: [],
    displayList: []
  },

  onLoad() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData(true).finally(() => wx.stopPullDownRefresh())
  },

  async loadData(force) {
    this.setData({ loading: true })
    try {
      const app = getApp()
      await app.ensureReady()
      const res = await api.getAugmentTierList(force)
      const map = app.globalData.championMap || {}
      const allList = (res.list || []).map(a => {
        const names = (a.champions || []).slice(0, 5).map(c => {
          const ch = map[c.id]
          return ch ? ch.name : ''
        }).filter(Boolean)
        return Object.assign({}, a, {
          topChampNames: names.join(' / ')
        })
      })
      this.setData({ allList, loading: false })
      this.applyFilter()
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value || '' })
    this.debouncedFilter()
  },

  debouncedFilter: debounce(function () {
    this.applyFilter()
  }, 200),

  onTab(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.tab) return
    this.setData({ tab: key })
    this.applyFilter()
  },

  applyFilter() {
    const { allList, keyword, tab } = this.data
    const kw = (keyword || '').trim().toLowerCase()
    let list = allList.slice()
    if (tab === 'prismatic') list = list.filter(a => a.rarity === 8)
    if (tab === 'gold') list = list.filter(a => a.rarity === 4)
    if (tab === 'silver') list = list.filter(a => a.rarity === 1)
    if (kw) {
      list = list.filter(a =>
        (a.name && a.name.toLowerCase().includes(kw)) ||
        (a.key && a.key.toLowerCase().includes(kw)) ||
        (a.desc && a.desc.toLowerCase().includes(kw))
      )
    }
    this.setData({ displayList: list })
  },

  goIndex() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({ url: '/pages/index/index' })
      }
    })
  }
})
