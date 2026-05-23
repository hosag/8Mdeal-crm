const {
  detectFollowUpMethodFromContent,
  extractFollowUpOccurredMetaFromContent,
  resolvePreferredFollowUpMethod,
  resolvePreferredFollowUpOccurredMeta
} = require('../utils/follow-up-meta')

const NOW = new Date('2026-05-23T16:20:00+08:00')

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", got "${actual}"`)
  }
}

function assertMeta(actual, expected, label) {
  assertEqual(actual.followUpOccurredDate, expected.followUpOccurredDate, `${label}.followUpOccurredDate`)
  assertEqual(actual.followUpOccurredTime, expected.followUpOccurredTime, `${label}.followUpOccurredTime`)
  assertEqual(actual.followUpOccurredTimePrecision, expected.followUpOccurredTimePrecision, `${label}.followUpOccurredTimePrecision`)
}

function runMethodAndTimeCases() {
  const cases = [
    {
      text: '昨晚电话交流了半小时，客户说先内部评估',
      expectedMethod: '电话',
      expectedMeta: {
        followUpOccurredDate: '2026-05-22',
        followUpOccurredTime: '20:00',
        followUpOccurredTimePrecision: 'coarse'
      }
    },
    {
      text: '昨天微信沟通，对方要我明天发报价',
      expectedMethod: '微信',
      expectedMeta: {
        followUpOccurredDate: '2026-05-22',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'coarse'
      }
    },
    {
      text: '5月3日去公司面谈，现场看了机房',
      expectedMethod: '面谈',
      expectedMeta: {
        followUpOccurredDate: '2026-05-03',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'coarse'
      }
    },
    {
      text: '昨晚 8:30 邮件回复了技术方案',
      expectedMethod: '邮件',
      expectedMeta: {
        followUpOccurredDate: '2026-05-22',
        followUpOccurredTime: '20:30',
        followUpOccurredTimePrecision: 'exact'
      }
    },
    {
      text: '明天来公司见面，今天先电话沟通了需求',
      expectedMethod: '电话',
      expectedMeta: {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'coarse'
      }
    },
    {
      text: '明天面谈，昨天微信沟通过一轮',
      expectedMethod: '微信',
      expectedMeta: {
        followUpOccurredDate: '2026-05-22',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'coarse'
      }
    },
    {
      text: '今晚打电话，刚刚微信同步了报价',
      expectedMethod: '微信',
      expectedMeta: {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'default_now'
      }
    },
    {
      text: '下周见面，今天邮件回了技术方案',
      expectedMethod: '邮件',
      expectedMeta: {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'coarse'
      }
    },
    {
      text: '今晚 8:30 给客户打电话',
      expectedMethod: '其他',
      expectedMeta: {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'default_now'
      }
    },
    {
      text: '今天下午安排电话沟通',
      expectedMethod: '其他',
      expectedMeta: {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '15:00',
        followUpOccurredTimePrecision: 'coarse'
      }
    },
    {
      text: '今天上午约了去公司面谈',
      expectedMethod: '其他',
      expectedMeta: {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '10:00',
        followUpOccurredTimePrecision: 'coarse'
      }
    },
    {
      text: '先微信后电话确认了价格',
      expectedMethod: '其他',
      expectedMeta: {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'default_now'
      }
    },
    {
      text: '补一句跟进，没有提时间也没有提方式',
      expectedMethod: '其他',
      expectedMeta: {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'default_now'
      }
    }
  ]

  cases.forEach((testCase, index) => {
    const method = detectFollowUpMethodFromContent(testCase.text, { now: NOW })
    const meta = extractFollowUpOccurredMetaFromContent(testCase.text, { now: NOW })
    assertEqual(method, testCase.expectedMethod, `case[${index}].method`)
    assertMeta(meta, testCase.expectedMeta, `case[${index}].time`)
  })
}

function runResolverCases() {
  assertEqual(
    resolvePreferredFollowUpMethod({
      detectedMethod: '电话',
      aiMethod: '微信',
      fallbackMethod: '其他'
    }),
    '电话',
    'resolvePreferredFollowUpMethod.detectedFirst'
  )

  assertEqual(
    resolvePreferredFollowUpMethod({
      detectedMethod: '其他',
      aiMethod: '邮件',
      fallbackMethod: '其他'
    }),
    '邮件',
    'resolvePreferredFollowUpMethod.aiFallback'
  )

  assertMeta(
    resolvePreferredFollowUpOccurredMeta(
      {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'default_now'
      },
      {
        followUpOccurredDate: '2026-05-22',
        followUpOccurredTime: '20:00',
        followUpOccurredTimePrecision: 'coarse'
      },
      { now: NOW }
    ),
    {
      followUpOccurredDate: '2026-05-22',
      followUpOccurredTime: '20:00',
      followUpOccurredTimePrecision: 'coarse'
    },
    'resolvePreferredFollowUpOccurredMeta.useHistoricalDetected'
  )

  assertMeta(
    resolvePreferredFollowUpOccurredMeta(
      {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '16:20',
        followUpOccurredTimePrecision: 'default_now'
      },
      {
        followUpOccurredDate: '2026-05-23',
        followUpOccurredTime: '15:00',
        followUpOccurredTimePrecision: 'coarse'
      },
      { now: NOW }
    ),
    {
      followUpOccurredDate: '2026-05-23',
      followUpOccurredTime: '16:20',
      followUpOccurredTimePrecision: 'default_now'
    },
    'resolvePreferredFollowUpOccurredMeta.avoidSameDayCoarseOverride'
  )

  assertMeta(
    resolvePreferredFollowUpOccurredMeta(
      {
        followUpOccurredDate: '2026-05-22',
        followUpOccurredTime: '20:30',
        followUpOccurredTimePrecision: 'exact'
      },
      {
        followUpOccurredDate: '2026-05-22',
        followUpOccurredTime: '20:00',
        followUpOccurredTimePrecision: 'coarse'
      },
      { now: NOW }
    ),
    {
      followUpOccurredDate: '2026-05-22',
      followUpOccurredTime: '20:30',
      followUpOccurredTimePrecision: 'exact'
    },
    'resolvePreferredFollowUpOccurredMeta.aiExactFirst'
  )
}

function main() {
  runMethodAndTimeCases()
  runResolverCases()
  console.log('follow_up meta regression checks passed')
}

main()
