import {
  formatAwardDecision,
  formatAwardType,
  formatCompetitionStatus,
  formatCountry,
  formatNumber,
  formatOrganiserType,
  formatRegion,
  formatRole,
  initials,
  uniqueValues,
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

  it('formats numbers with locale grouping', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(582)).toBe('582');
    expect(formatNumber(80027)).toBe('80,027');
  });

  it('derives at most two uppercase initials from name tokens', () => {
    expect(initials('Claude Example-Name')).toBe('CE');
    expect(initials('ZHU KE')).toBe('ZK');
    expect(initials('single')).toBe('S');
    expect(initials('a_b c-d')).toBe('AB');
  });

  it('deduplicates, drops empties and sorts unique values', () => {
    expect(uniqueValues(['b', 'a', 'b', '', 'a', 'c'])).toEqual(['a', 'b', 'c']);
    expect(uniqueValues([])).toEqual([]);
  });

  it('falls back to the raw code for unknown countries', () => {
    expect(formatCountry('')).toBe('未公开');
    expect(formatCountry('unknown')).toBe('未公开');
    expect(formatCountry('deu')).toBe(formatCountry('DEU'));
    expect(formatCountry('ZZZ')).toBe('ZZZ');
  });
});
