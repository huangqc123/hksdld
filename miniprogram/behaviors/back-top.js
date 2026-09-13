module.exports = Behavior({
  data: {
    showBackTop: false
  },
  methods: {
    onPageScroll(e) {
      const show = (e.scrollTop || 0) > 400
      if (show !== this.data.showBackTop) this.setData({ showBackTop: show })
    }
  }
})
