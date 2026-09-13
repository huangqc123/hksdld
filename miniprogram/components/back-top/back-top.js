Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    onTap() {
      wx.pageScrollTo({ scrollTop: 0, duration: 280 })
    }
  }
})
