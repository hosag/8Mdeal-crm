module.exports = {
  dashboard: {
    metrics: [
      { label: '本月新增', value: '18', note: '较上月 +6' },
      { label: '成交金额', value: '286万', note: '在谈池 520万' },
      { label: '待跟进', value: '7', note: '逾期 2 个' }
    ],
    todos: [
      {
        id: 1,
        projectId: 'p1',
        title: '华东制造集团数字工厂项目',
        client: '华东制造集团',
        stage: '商务',
        estimatedAmount: '120万',
        contactCount: 3,
        ownerLabel: '我负责推进',
        focusText: '围绕报价、合同条款和预算拍板推进',
        latestSummary: '客户确认本周五先看商务条款，再决定是否走法务。',
        time: '今天 15:30',
        priority: '优先动作：确认预算拍板人与合同节奏',
        steps: ['先补一条阶段更新，避免信息断层', '现场前把方案版本同步到外发卡片', '面谈结束后 10 分钟内录入跟进'],
        badge: '高优先'
      }
    ],
    timeline: [
      {
        date: '今天',
        items: [
          { time: '09:12', title: '新增项目「星澜零售会员中台」', desc: '已录入预计金额、关键联系人和首轮需求摘要。', projectId: 'p3' },
          { time: '11:30', title: '华东制造集团进入商务阶段', desc: '客户确认本周五完成商务条款沟通，预算口径已锁定。', projectId: 'p1' }
        ]
      }
    ]
  },
  projectCards: [
    {
      id: 'p1',
      name: '华东制造集团数字工厂项目',
      client: '华东制造集团',
      stage: '商务',
      next: '今天 15:30 面谈',
      amount: '120万',
      commission: '8.4万',
      latest: '2 小时前更新',
      progress: 82,
      tag: '我创建'
    },
    {
      id: 'p2',
      name: '云栖医疗数据治理项目',
      client: '云栖医疗',
      stage: '方案',
      next: '明天 10:00 电话',
      amount: '86万',
      commission: '6.2万',
      latest: '昨天 18:10',
      progress: 61,
      tag: '外发给我'
    }
  ],
  projectDetail: {
    name: '华东制造集团数字工厂项目',
    client: '华东制造集团',
    stage: '商务',
    estimatedAmount: '120万',
    actualAmount: '98万',
    expectedCommission: '8.4万',
    nextFollowUp: '今天 15:30',
    description: '围绕工厂设备联网、生产追溯和经营驾驶舱三条主线推进，现阶段重点锁定商务条款与排期。'
  },
  contacts: [
    { id: 'c1', name: '赵晋', role: '决策人', phone: '138 0013 8000', wechat: 'zhaojin_hd', company: '华东制造集团' },
    { id: 'c2', name: '何宁', role: '技术对接', phone: '139 1122 3344', wechat: 'hening_it', company: '华东制造集团' }
  ],
  followTimeline: [
    {
      date: '今天',
      items: [
        { time: '10:10', title: '内部预演', desc: '售前确认设备接入边界，建议报价拆成基础包与扩展包。' }
      ]
    }
  ],
  shareModes: [
    { key: 'info', title: '分享信息', desc: '发给需要了解项目情况的人，只展示授权字段，不转移管理权。', badge: '仅查看' },
    { key: 'outbound', title: '项目外发', desc: '发给需要正式接手项目的人，展示推进所需信息，打开后转移管理权。', badge: '接手管理权' }
  ],
  shareTags: [
    { id: 't1', name: '基础浏览', desc: '隐藏电话、微信，仅展示项目基础信息与联系人姓名。', fields: ['项目概况', '阶段', '预计金额', '联系人姓名'] },
    { id: 't2', name: '完整外发', desc: '展示全部信息，适合项目接手。', fields: ['项目概况', '全部联系方式', '跟进摘要', '下次动作'] }
  ],
  outboundProjects: [
    { id: 's1', name: '云栖医疗数据治理项目', partner: '智域渠道', mode: '项目外发', viewed: '已查看 5 次', status: '进行中' }
  ],
  earnings: {
    summary: [
      { label: '本月成交', value: '286万' },
      { label: '预期提成', value: '19.6万' },
      { label: '已回款', value: '168万' }
    ],
    deals: [
      { id: 'd1', name: '晨曜咨询流程优化项目', amount: '48万', commission: '3.6万', status: '部分回款', date: '2026-04-12' }
    ]
  },
  privacyTags: [
    { id: 't1', name: '基础浏览', desc: '适合先了解项目情况，不暴露联系方式。', fields: ['项目名称', '客户名称', '阶段', '预计金额', '联系人姓名'] }
  ],
  visibleFields: ['项目名称', '客户名称', '当前阶段', '预计金额', '项目描述', '联系人姓名', '联系人电话', '联系人微信', '跟进摘要', '下一步动作', '分享来源']
}
