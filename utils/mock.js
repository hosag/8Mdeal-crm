const dashboard = {
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
    },
    {
      id: 2,
      projectId: 'p2',
      title: '云栖医疗数据治理项目',
      client: '云栖医疗',
      stage: '方案',
      estimatedAmount: '86万',
      contactCount: 2,
      ownerLabel: '陈顾问 外发给我',
      focusText: '接手后先确认共享历史，再继续推进',
      latestSummary: '技术评估还差最终结论，商务是否推进待定。',
      time: '明天 10:00',
      priority: '优先动作：拿到技术评估结论，决定是否推进商务',
      steps: ['复核联系人完整性', '准备可共享的外发卡片', '约定下一次跟进时间'],
      badge: '待确认'
    }
  ],
  timeline: [
    {
      date: '今天',
      items: [
        { time: '09:12', title: '新增项目「星澜零售会员中台」', desc: '已录入预计金额、关键联系人和首轮需求摘要。', projectId: 'p3' },
        { time: '11:30', title: '华东制造集团进入商务阶段', desc: '客户确认本周五完成商务条款沟通，预算口径已锁定。', projectId: 'p1' }
      ]
    },
    {
      date: '昨天',
      items: [
        { time: '16:20', title: '完成分享配置', desc: '本次使用“基础浏览”标签，自动隐藏客户电话与微信。', projectId: 'p1' },
        { time: '18:05', title: '录入成交记录', desc: '晨曜咨询签约 48 万，预计提成 3.6 万，回款状态为部分回款。', projectId: 'p1' }
      ]
    }
  ]
}

const projectCards = [
  {
    id: 'p1',
    name: '华东制造集团数字工厂项目',
    client: '华东制造集团',
    stage: '商务',
    next: '今天 15:30 面谈',
    nextFollowUpAt: '2026-04-18T15:30:00+08:00',
    nextStatus: 'today',
    nextStatusText: '今天跟进',
    amount: '120万',
    amountValue: 1200000,
    commission: '8.4万',
    commissionValue: 84000,
    latest: '2 小时前更新',
    updatedAtRaw: '2026-04-18T10:20:00+08:00',
    progress: 82,
    tag: '我创建',
    ownerType: 'owned',
    ownerLabel: '我负责推进',
    contactNames: ['赵晋', '何宁'],
    contactCount: 3,
    focusText: '围绕报价、合同条款和预算拍板推进',
    latestSummary: '客户确认本周五先看商务条款，再决定是否走法务。',
    tags: ['重点客户', '本周推进']
  },
  {
    id: 'p2',
    name: '云栖医疗数据治理项目',
    client: '云栖医疗',
    stage: '方案',
    next: '明天 10:00 电话',
    nextFollowUpAt: '2026-04-19T10:00:00+08:00',
    nextStatus: 'upcoming',
    nextStatusText: '待跟进',
    amount: '86万',
    amountValue: 860000,
    commission: '6.2万',
    commissionValue: 62000,
    latest: '昨天 18:10',
    updatedAtRaw: '2026-04-17T18:10:00+08:00',
    progress: 61,
    tag: '外发给我',
    ownerType: 'shared_in',
    ownerLabel: '陈顾问 外发给我',
    contactNames: ['陆晨', '汪宁'],
    contactCount: 2,
    focusText: '接手后先确认共享历史，再继续推进',
    latestSummary: '技术评估还差最终结论，商务是否推进待定。',
    tags: ['技术评估', '共享项目'],
    sharedFromName: '陈顾问'
  },
  {
    id: 'p3',
    name: '星澜零售会员中台',
    client: '星澜零售',
    stage: '洽谈',
    next: '4月18日 14:00 微信',
    nextFollowUpAt: '2026-04-18T14:00:00+08:00',
    nextStatus: 'overdue',
    nextStatusText: '已逾期',
    amount: '54万',
    amountValue: 540000,
    commission: '3.5万',
    commissionValue: 35000,
    latest: '今天 09:12',
    updatedAtRaw: '2026-04-18T09:12:00+08:00',
    progress: 38,
    tag: '我创建',
    ownerType: 'owned',
    ownerLabel: '我负责推进',
    contactNames: ['沈可', '周安'],
    contactCount: 2,
    focusText: '把需求边界和关键联系人补完整',
    latestSummary: '客户对会员体系升级有兴趣，下一步需要确认预算口径。',
    tags: ['零售', '会员体系']
  }
]

const projectDetail = {
  name: '华东制造集团数字工厂项目',
  client: '华东制造集团',
  stage: '商务',
  estimatedAmount: '120万',
  actualAmount: '98万',
  expectedCommission: '8.4万',
  nextFollowUp: '今天 15:30',
  description: '围绕工厂设备联网、生产追溯和经营驾驶舱三条主线推进，现阶段重点锁定商务条款与排期。'
}

const contacts = [
  { id: 'c1', name: '赵晋', role: '决策人', phone: '138 0013 8000', wechat: 'zhaojin_hd', company: '华东制造集团' },
  { id: 'c2', name: '何宁', role: '技术对接', phone: '139 1122 3344', wechat: 'hening_it', company: '华东制造集团' },
  { id: 'c3', name: '陈薇', role: '采购', phone: '137 8888 9090', wechat: 'chenwei_buy', company: '华东制造集团' }
]

const followTimeline = [
  {
    date: '今天',
    items: [
      { time: '10:10', title: '内部预演', desc: '售前确认设备接入边界，建议报价拆成基础包与扩展包。' }
    ]
  },
  {
    date: '昨天',
    items: [
      { time: '18:22', title: '客户确认商务节奏', desc: '客户希望本周五先看商务条款，再决定是否走法务。' },
      { time: '14:05', title: '面谈记录', desc: '客户重点关注项目实施团队与成功案例，已同步补充材料。' }
    ]
  }
]

const shareModes = [
  { key: 'info', title: '分享信息', desc: '发给需要了解项目情况的人，只展示授权字段，不转移管理权。', badge: '仅查看' },
  { key: 'outbound', title: '项目外发', desc: '发给需要正式接手项目的人，展示推进所需信息，打开后转移管理权。', badge: '接手管理权' }
]

const shareTags = [
  { id: 't1', name: '基础浏览', desc: '隐藏电话、微信，仅展示项目基础信息与联系人姓名。', fields: ['项目概况', '阶段', '预计金额', '联系人姓名'] },
  { id: 't2', name: '完整外发', desc: '展示全部信息，适合项目接手。', fields: ['项目概况', '全部联系方式', '跟进摘要', '下次动作'] },
  { id: 't3', name: '全量查看', desc: '完整可见，并附带来源说明。', fields: ['全部项目字段', '联系人方式', '分享来源'] }
]

const outboundProjects = [
  {
    id: 's1',
    projectId: 'p2',
    importedProjectId: 'p2-shared-in',
    name: '云栖医疗数据治理项目',
    partner: '智域渠道',
    mode: '项目外发',
    viewed: '预览 5 次',
    viewCount: 5,
    receiverName: '李渠道',
    createdAt: '04-16 10:20',
    createdAtRaw: '2026-04-16T10:20:00+08:00',
    updatedAtRaw: '2026-04-18T09:30:00+08:00',
    firstOpenedAt: '04-16 10:45',
    firstOpenedAtRaw: '2026-04-16T10:45:00+08:00',
    importedAt: '04-16 11:12',
    importedAtRaw: '2026-04-16T11:12:00+08:00',
    lastViewedAt: '04-18 09:30',
    statusText: '已跟进',
    collaboratorFollowCount: 2,
    collaboratorLatestFollowAt: '04-18 09:12',
    status: '进行中',
    stage: '方案'
  },
  {
    id: 's2',
    projectId: 'p1',
    importedProjectId: '',
    name: '晨曜咨询流程优化项目',
    partner: '售前支持群',
    mode: '分享信息',
    viewed: '预览 2 次',
    viewCount: 2,
    receiverName: '售前值班组',
    createdAt: '04-12 18:00',
    createdAtRaw: '2026-04-12T18:00:00+08:00',
    updatedAtRaw: '2026-04-12T18:40:00+08:00',
    firstOpenedAt: '04-12 18:08',
    firstOpenedAtRaw: '2026-04-12T18:08:00+08:00',
    lastViewedAt: '04-12 18:40',
    importedAt: '',
    importedAtRaw: '',
    statusText: '已打开',
    collaboratorFollowCount: 0,
    collaboratorLatestFollowAt: '',
    status: '已成交',
    stage: '成交'
  }
]

const earnings = {
  summary: [
    { label: '本月成交', value: '286万' },
    { label: '预期提成', value: '19.6万' },
    { label: '已回款', value: '168万' }
  ],
  deals: [
    { id: 'd1', name: '晨曜咨询流程优化项目', amount: '48万', commission: '3.6万', status: '部分回款', date: '2026-04-12' },
    { id: 'd2', name: '柏川软件出海咨询', amount: '92万', commission: '6.8万', status: '全部回款', date: '2026-04-08' },
    { id: 'd3', name: '森野科技数据中台升级', amount: '146万', commission: '9.2万', status: '未回款', date: '2026-04-03' }
  ]
}

const privacyTags = [
  { id: 't1', name: '基础浏览', desc: '适合先了解项目情况，不暴露联系方式。', fields: ['项目名称', '客户名称', '阶段', '预计金额', '联系人姓名'] },
  { id: 't2', name: '完整外发', desc: '用于正式接手场景，展示完整联系方式。', fields: ['项目名称', '联系人姓名', '电话', '微信', '项目描述'] },
  { id: 't3', name: '全量查看', desc: '允许查看完整字段和跟进摘要。', fields: ['全部字段', '分享来源', '下一步动作'] }
]

const visibleFields = [
  '项目名称',
  '客户名称',
  '当前阶段',
  '预计金额',
  '项目描述',
  '联系人姓名',
  '联系人电话',
  '联系人微信',
  '跟进摘要',
  '下一步动作',
  '分享来源'
]

module.exports = {
  dashboard,
  projectCards,
  projectDetail,
  contacts,
  followTimeline,
  shareModes,
  shareTags,
  outboundProjects,
  earnings,
  privacyTags,
  visibleFields
}
