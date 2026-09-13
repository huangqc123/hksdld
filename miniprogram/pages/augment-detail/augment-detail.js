const api = require('../../utils/api')
const backTop = require('../../behaviors/back-top')

Page({
  behaviors: [backTop],
  data: {
    loading: true,
    aug: null,
    related: [],
    heroes: [],
    stages: []
  },

  onLoad(query) {
    this.key = query.key ? decodeURIComponent(query.key) : ''
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const app = getApp()
      await app.ensureReady()
      const res = await api.getAugmentDetail(this.key)
      if (res.augment && res.augment.name) {
        wx.setNavigationBarTitle({ title: res.augment.name })
      }
      this.setData({
        loading: false,
        aug: res.augment,
        related: res.related || [],
        heroes: res.heroes || [],
        stages: res.stages || []
      })
    } catch (e) {
      console.error(e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  goAug(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.key) return
    wx.redirectTo({
      url: `/pages/augment-detail/augment-detail?key=${encodeURIComponent(key)}`
    })
  }
})
