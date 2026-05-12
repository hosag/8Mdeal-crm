Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    appearancePageClass: {
      type: String,
      value: ''
    },
    projectName: {
      type: String,
      value: ''
    },
    projectMeta: {
      type: Object,
      value: null
    },
    options: {
      type: Array,
      value: []
    }
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    onSelect(event) {
      const mode = String(event.currentTarget.dataset.mode || 'info').trim() || 'info'
      this.triggerEvent('select', { mode })
    }
  }
})
