const api = require('./utils/api')

App({
  globalData: {
    version: '',
    champions: [],
    championMap: {},
    ready: false
  },

  onLaunch() {
    this.startBootstrap().catch(() => {})
  },

  startBootstrap(force) {
    this.bootPromise = this.bootstrap(force).catch(e => {
      this.bootPromise = null
      throw e
    })
    return this.bootPromise
  },

  async bootstrap(force) {
    try {
      const [base] = await Promise.all([
        api.initStaticData(force),
        api.getMayhemChampions(force)
      ])
      this.globalData.version = base.version
      this.globalData.champions = base.champions
      this.globalData.championMap = base.championMap
      this.globalData.ready = true
      return base
    } catch (e) {
      console.error('bootstrap failed', e)
      throw e
    }
  },

  ensureReady() {
    if (this.globalData.ready) return Promise.resolve(this.globalData)
    return this.bootPromise || this.startBootstrap()
  }
})
