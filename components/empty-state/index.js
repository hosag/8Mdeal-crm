Component({
  properties: {
    appearancePageClass: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: '暂无内容'
    },
    desc: {
      type: String,
      value: '有内容后会自动显示在这里。'
    },
    image: {
      type: String,
      value: '/assets/illustrations/empty-projects.svg'
    },
    actionText: {
      type: String,
      value: ''
    }
  },

  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
