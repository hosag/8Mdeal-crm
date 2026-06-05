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
      value: '正在加载内容'
    },
    desc: {
      type: String,
      value: '加载完成后会自动刷新当前页面。'
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
