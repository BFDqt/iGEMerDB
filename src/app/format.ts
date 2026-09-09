const numberFormatter = new Intl.NumberFormat('zh-CN');
const countryDisplay = new Intl.DisplayNames(['zh-CN'], { type: 'region' });

const alpha3CountryLabels: Record<string, string> = {
  ARG: '阿根廷',
  BGR: '保加利亚',
  BOL: '玻利维亚',
  CHL: '智利',
  COD: '刚果（金）',
  COL: '哥伦比亚',
  CRI: '哥斯达黎加',
  HND: '洪都拉斯',
  HUN: '匈牙利',
  IRL: '爱尔兰',
  KEN: '肯尼亚',
  NZL: '新西兰',
  PAK: '巴基斯坦',
  PAN: '巴拿马',
  PER: '秘鲁',
  PRT: '葡萄牙',
  RUS: '俄罗斯',
  SAU: '沙特阿拉伯',
  SVN: '斯洛文尼亚',
  ZAF: '南非',
  IRQ: '伊拉克',
  NPL: '尼泊尔',
  ARE: '阿联酋',
  AUS: '澳大利亚',
  AUT: '奥地利',
  BEL: '比利时',
  BRA: '巴西',
  CAN: '加拿大',
  CHE: '瑞士',
  CHN: '中国',
  CZE: '捷克',
  DEU: '德国',
  DNK: '丹麦',
  ECU: '厄瓜多尔',
  EGY: '埃及',
  ESP: '西班牙',
  EST: '爱沙尼亚',
  FIN: '芬兰',
  FRA: '法国',
  GBR: '英国',
  GHA: '加纳',
  GRC: '希腊',
  HKG: '中国香港',
  IDN: '印度尼西亚',
  IND: '印度',
  ISL: '冰岛',
  ISR: '以色列',
  ITA: '意大利',
  JPN: '日本',
  KAZ: '哈萨克斯坦',
  KOR: '韩国',
  KWT: '科威特',
  LTU: '立陶宛',
  LVA: '拉脱维亚',
  MAC: '中国澳门',
  MEX: '墨西哥',
  NLD: '荷兰',
  NOR: '挪威',
  POL: '波兰',
  PRI: '波多黎各',
  QAT: '卡塔尔',
  ROU: '罗马尼亚',
  SGP: '新加坡',
  SWE: '瑞典',
  THA: '泰国',
  TUR: '土耳其',
  TWN: '中国台湾',
  UGA: '乌干达',
  USA: '美国',
};

export const sectionLabels: Record<string, string> = {
  undergrad: '本科组',
  overgrad: '研究生组',
  'high-school': '高中组',
  collegiate: '高校组',
  unknown: '未分类',
};

export const regionLabels: Record<string, string> = {
  asia: '亚洲',
  europe: '欧洲',
  'north-america': '北美洲',
  'latin-america': '拉丁美洲',
  africa: '非洲',
  oceania: '大洋洲',
  unknown: '未分类',
};

export const roleLabels: Record<string, string> = {
  Undergrad: '本科生',
  Graduate: '研究生',
  Student: '学生',
  PI: 'PI',
  Advisor: '顾问',
  Instructor: '指导教师',
  Other: '其他',
  Unknown: '未知',
};

export const organiserTypeLabels: Record<string, string> = {
  'community-lab': '社区实验室',
  commercial: '商业机构',
  'higher-education': '高等教育机构',
  'secondary-education': '中等教育机构',
  unknown: '未分类',
};

export const teamStatusLabels: Record<string, string> = {
  accepted: '已接受',
  disqualified: '已取消资格',
  withdrawn: '已撤回',
  unknown: '状态未公开',
};

export const teamExportCategoryLabels: Record<string, string> = {
  accepted: '正式收录',
  disqualified: '取消资格',
  'demo-test': '演示 / 测试记录',
  review: '待审核',
  withdrawn: '已撤回',
  unknown: '待审核',
};

export const competitionStatusLabels: Record<string, string> = {
  archived: '已归档',
  live: '进行中',
  unknown: '状态未公开',
};

export const awardTypeLabels: Record<string, string> = {
  community: '社区奖项',
  finalist: '决赛入围',
  'grand-prize': '总冠军',
  medal: '奖牌',
  special: '特别奖',
  village: '主题领域奖',
  unknown: '未分类',
};

export const awardDecisionLabels: Record<string, string> = {
  nominee: '提名',
  winner: '获奖',
  unknown: '结果未公开',
};

function normalizeEnum(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[_\s]+/g, '-');
}

function formatRawEnum(value: string, emptyLabel: string): string {
  const normalized = value.trim();
  return normalized
    ? normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
    : emptyLabel;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatCountry(code: string): string {
  if (!code || code.toLocaleLowerCase() === 'unknown') return '未公开';
  const normalized = code.toUpperCase();
  if (alpha3CountryLabels[normalized]) return alpha3CountryLabels[normalized];
  try {
    return countryDisplay.of(normalized) ?? code;
  } catch {
    return code;
  }
}

export function formatSection(value: string): string {
  return sectionLabels[normalizeEnum(value)] ?? formatRawEnum(value, '未分类');
}

export function formatRegion(value: string): string {
  return regionLabels[normalizeEnum(value)] ?? formatRawEnum(value, '未分类');
}

export function formatRole(value: string): string {
  const normalized = normalizeEnum(value);
  const canonicalRoles: Record<string, keyof typeof roleLabels> = {
    advisor: 'Advisor',
    graduate: 'Graduate',
    instructor: 'Instructor',
    other: 'Other',
    pi: 'PI',
    'primary-pi': 'PI',
    'secondary-pi': 'PI',
    student: 'Student',
    'student-leader': 'Student',
    undergrad: 'Undergrad',
    unknown: 'Unknown',
  };
  const canonical = canonicalRoles[normalized];
  return canonical
    ? roleLabels[canonical]
    : formatRawEnum(value, roleLabels.Unknown);
}

export function formatOrganiserType(value: string): string {
  return (
    organiserTypeLabels[normalizeEnum(value)] ?? formatRawEnum(value, '未分类')
  );
}

export function formatTeamStatus(value: string): string {
  return (
    teamStatusLabels[normalizeEnum(value)] ?? formatRawEnum(value, '状态未公开')
  );
}

export function formatTeamExportCategory(value: string): string {
  return (
    teamExportCategoryLabels[normalizeEnum(value)] ??
    formatRawEnum(value, '待审核')
  );
}

export function formatCompetitionStatus(value: string): string {
  return (
    competitionStatusLabels[normalizeEnum(value)] ??
    formatRawEnum(value, '状态未公开')
  );
}

export function formatAwardType(value: string): string {
  return (
    awardTypeLabels[normalizeEnum(value)] ?? formatRawEnum(value, '未分类')
  );
}

export function formatAwardDecision(value: string): string {
  return (
    awardDecisionLabels[normalizeEnum(value)] ??
    formatRawEnum(value, '结果未公开')
  );
}

export function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('');
}

export function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
