function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      header: Object.assign({
        'Accept': 'application/json,text/html,*/*'
      }, options.header || {}),
      timeout: options.timeout || 20000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      responseType: 'text',
      header: {
        'Accept': 'text/html,application/xhtml+xml,*/*'
      },
      timeout: 25000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(typeof res.data === 'string' ? res.data : String(res.data || ''))
        } else {
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      },
      fail(err) {
        reject(err)
      }
    })
  })
}

function formatPercent(v, digits = 1) {
  if (v == null || isNaN(v)) return '-'
  const n = Number(v)
  const pct = n <= 1 ? n * 100 : n
  return pct.toFixed(digits) + '%'
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return '-'
  const v = Number(n)
  if (v >= 10000) return (v / 10000).toFixed(1) + '万'
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k'
  return String(v)
}

function debounce(fn, wait = 300) {
  let t = null
  return function debounced(...args) {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn.apply(this, args), wait)
  }
}

function tierLabel(tier) {
  const map = {
    0: 'OP',
    1: 'S',
    2: 'A',
    3: 'B',
    4: 'C',
    5: 'D'
  }
  return map[tier] || (tier != null ? String(tier) : '-')
}

function tierClass(tier) {
  if (tier === 0 || tier === 1) return 'tier-s'
  if (tier === 2) return 'tier-a'
  if (tier === 3) return 'tier-b'
  if (tier === 4) return 'tier-c'
  return 'tier-d'
}

module.exports = {
  request,
  requestText,
  formatPercent,
  formatNumber,
  debounce,
  tierLabel,
  tierClass
}
