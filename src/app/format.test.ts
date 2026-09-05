import {
  formatAwardDecision,
  formatAwardType,
  formatCompetitionStatus,
  formatCountry,
  formatOrganiserType,
  formatRegion,
  formatRole,
  formatSection,
  formatTeamExportCategory,
  formatTeamStatus,
} from './format';

describe('public enum labels', () => {
  it('labels neutral and missing roles without inventing education level', () => {
    expect(formatRole('Student')).toBe('学生');
    expect(formatRole('student-leader')).toBe('学生');
    expect(formatRole('Unknown')).toBe('未知');
    expect(formatRole('')).toBe('未知');
  });

  it('includes unknown categories and all current competition regions', () => {
    expect(formatSection('')).toBe('未分类');
    expect(formatSection('unknown')).toBe('未分类');
    expect(formatRegion('oceania')).toBe('大洋洲');
    expect(formatRegion('unknown')).toBe('未分类');
    expect(formatCountry('unknown')).toBe('未公开');
  });

  it('localizes raw status, organizer and award enums', () => {
    expect(formatOrganiserType('higher-education')).toBe('高等教育机构');
    expect(formatTeamStatus('withdrawn')).toBe('已撤回');
    expect(formatTeamExportCategory('demo-test')).toBe('演示 / 测试记录');
    expect(formatCompetitionStatus('archived')).toBe('已归档');
    expect(formatAwardType('grand-prize')).toBe('总冠军');
    expect(formatAwardDecision('nominee')).toBe('提名');
  });
});
