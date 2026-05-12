const { loadProjectDetailData } = require('../../services/data')
const { syncPageAppearance } = require('../../utils/appearance')

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'image', label: '图片' },
  { key: 'file', label: '附件' }
]

function normalizeAssetList(value) {
  return (Array.isArray(value) ? value : []).map((item, index) => {
    const asset = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
    const type = String(asset.type || '').trim() === 'file' ? 'file' : 'image'
    const extension = String(asset.extension || (type === 'image' ? 'image' : 'file')).trim()

    return {
      id: String(asset.id || `asset-${index}`).trim(),
      type,
      fileId: String(asset.fileId || '').trim(),
      url: String(asset.url || asset.fileId || '').trim(),
      previewUrl: String(asset.previewUrl || asset.url || asset.fileId || '').trim(),
      name: String(asset.name || (type === 'image' ? `项目图片${index + 1}` : `项目附件${index + 1}`)).trim(),
      extension,
      extensionText: type === 'image' ? '图片' : extension.toUpperCase(),
      sizeText: String(asset.sizeText || '').trim(),
      sourceTitle: String(asset.sourceTitle || '跟进记录').trim(),
      sourceSummary: String(asset.sourceSummary || '').trim(),
      sourceTime: String(asset.sourceTime || '').trim(),
      actorName: String(asset.actorName || '').trim()
    }
  })
}

function buildFilterOptions(assets) {
  const list = Array.isArray(assets) ? assets : []
  const counts = {
    all: list.length,
    image: list.filter((item) => item.type === 'image').length,
    file: list.filter((item) => item.type === 'file').length
  }

  return FILTERS.map((item) => ({
    ...item,
    count: counts[item.key] || 0
  }))
}

Page({
  data: {
    appearancePageClass: '',
    projectId: '',
    viewMode: '',
    projectName: '',
    isLoading: true,
    isLoadFailed: false,
    loadError: '',
    activeFilter: 'all',
    filterOptions: FILTERS,
    assets: [],
    filteredAssets: []
  },

  onLoad(options = {}) {
    syncPageAppearance(this)
    this.setData({
      projectId: String(options.projectId || '').trim(),
      viewMode: String(options.view || options.viewMode || '').trim()
    })
    this.fetchProjectAssets()
  },

  onShow() {
    syncPageAppearance(this)
  },

  async fetchProjectAssets() {
    if (!this.data.projectId) {
      this.setData({
        isLoading: false,
        isLoadFailed: true,
        loadError: '缺少项目参数'
      })
      return
    }

    this.setData({
      isLoading: true,
      isLoadFailed: false,
      loadError: ''
    })

    try {
      const { data } = await loadProjectDetailData(this.data.projectId, {
        viewMode: this.data.viewMode
      })
      const assets = normalizeAssetList(data.projectAssets || [])
      this.setData({
        projectName: data.projectDetail && data.projectDetail.name ? data.projectDetail.name : '项目资料',
        assets,
        filterOptions: buildFilterOptions(assets),
        isLoading: false
      }, () => this.applyFilter())
    } catch (error) {
      this.setData({
        isLoading: false,
        isLoadFailed: true,
        loadError: error && error.message ? error.message : '当前无法加载项目资料'
      })
    }
  },

  setFilter(event) {
    const filter = String(event.currentTarget.dataset.filter || 'all').trim()
    if (filter === this.data.activeFilter) {
      return
    }

    this.setData({
      activeFilter: FILTERS.some((item) => item.key === filter) ? filter : 'all'
    }, () => this.applyFilter())
  },

  applyFilter() {
    const activeFilter = this.data.activeFilter
    const filteredAssets = (this.data.assets || []).filter((item) => {
      if (activeFilter === 'image') {
        return item.type === 'image'
      }

      if (activeFilter === 'file') {
        return item.type === 'file'
      }

      return true
    })

    this.setData({
      filteredAssets
    })
  },

  retryFetch() {
    this.fetchProjectAssets()
  },

  openAsset(event) {
    const { id } = event.currentTarget.dataset
    const currentAsset = (this.data.assets || []).find((item) => item.id === id)
    if (!currentAsset) {
      return
    }

    if (currentAsset.type === 'image') {
      const urls = (this.data.assets || [])
        .filter((item) => item.type === 'image')
        .map((item) => item.previewUrl || item.url || item.fileId)
        .filter(Boolean)
      const current = currentAsset.previewUrl || currentAsset.url || currentAsset.fileId

      if (current && urls.length) {
        wx.previewImage({
          current,
          urls
        })
      }
      return
    }

    const filePath = currentAsset.url || currentAsset.fileId
    if (!filePath) {
      wx.showToast({
        title: '附件地址无效',
        icon: 'none'
      })
      return
    }

    wx.showToast({
      title: '当前附件暂不支持直接预览',
      icon: 'none'
    })
  }
})
