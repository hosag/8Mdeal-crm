Component({
  properties: {
    title: {
      type: String,
      value: '当前还没有内容'
    },
    desc: {
      type: String,
      value: '有数据后会自动显示在这里。'
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
