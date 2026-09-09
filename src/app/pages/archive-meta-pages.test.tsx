import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AboutPage } from './AboutPage';
import { InstitutionsPage } from './InstitutionsPage';

describe('InstitutionsPage', () => {
  it('indexes only official institutions of visible teams', () => {
    render(
      <MemoryRouter initialEntries={['/institutions']} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <InstitutionsPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: '机构名称索引' }),
    ).toBeInTheDocument();
    expect(screen.getByText('26 条记录')).toBeInTheDocument();
    expect(
      screen.getByText('按“名称记录”使用本目录。', { exact: false }),
    ).toBeInTheDocument();
    // Deduped fixture institutions render as headings with team links.
    expect(
      screen.getByRole('heading', { name: 'RWTH Aachen University' }),
    ).toBeInTheDocument();
  });

  it('offers only sort options the data model can honour', () => {
    render(
      <MemoryRouter initialEntries={['/institutions']} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <InstitutionsPage />
      </MemoryRouter>,
    );
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    // Official institutions index teams, not people — a people-count sort
    // would be a silent no-op and must not be offered.
    expect(options).not.toContain('公开成员数');
    expect(options).toContain('关联队伍数');
  });

  it('filters through the shareable query state', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/institutions']} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <InstitutionsPage />
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText('搜索机构、城市或国家代码');
    await user.type(input, 'Aachen');
    expect(screen.getByText(/1 条记录/)).toBeInTheDocument();
  });
});

describe('AboutPage', () => {
  it('documents coverage, provenance, and the privacy process', () => {
    render(
      <MemoryRouter initialEntries={['/about']} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AboutPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: '数据范围、方法与边界' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '逐年请求完成情况' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '隐私、纠错与撤回' }),
    ).toBeInTheDocument();
    // Every fixture competition appears in the per-year coverage table.
    expect(screen.getByText('2026')).toBeInTheDocument();
  });
});
