Component({
  properties: {
    appearancePageClass: {
      type: String,
      value: ''
    },
    rows: {
      type: Number,
      value: 3
    },
    title: {
      type: String,
      value: '正在同步页面内容'
    },
    desc: {
      type: String,
      value: '云端数据返回后会自动更新当前页面。'
    }
  },

  observers: {
    rows(value) {
      this.setData({
        placeholderRows: Array.from({ length: value }, (_, index) => index)
      })
    }
  },

  data: {
    placeholderRows: [0, 1, 2]
  }
})
