import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AwardsPage } from './AwardsPage';
import { CompetitionPage } from './CompetitionPage';
import { PeoplePage } from './PeoplePage';

function renderRoute(route: string) {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      {route.startsWith('/people') ? (
        <PeoplePage />
      ) : route.startsWith('/awards') ? (
        <AwardsPage />
      ) : (
        <CompetitionPage />
      )}
    </MemoryRouter>,
  );
}

describe('PeoplePage', () => {
  it('lists every published member of the default view', () => {
    renderRoute('/people');
    expect(
      screen.getByRole('heading', { name: '公开成员' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/582 条记录/)).toBeInTheDocument();
  });

  it('narrows results through the shareable query state', async () => {
    const user = userEvent.setup();
    renderRoute('/people');
    const input = screen.getByPlaceholderText('搜索姓名、用户名或机构');
    await user.type(input, 'Alexa');
    expect(screen.getByText(/1 条记录/)).toBeInTheDocument();
  });
});

describe('AwardsPage', () => {
  it('filters award results by year and decision from the URL', () => {
    renderRoute('/awards?year=2025&decision=winner');
    expect(
      screen.getByRole('heading', { name: '奖项与获奖队伍' }),
    ).toBeInTheDocument();
    expect(screen.getByText('13 条队伍结果')).toBeInTheDocument();
  });

  it('states openly when a season has no public results yet', () => {
    renderRoute('/awards?year=2026');
    expect(screen.getByText('该条件下没有公开结果')).toBeInTheDocument();
  });
});

describe('CompetitionPage', () => {
  it('renders per-year distributions that conserve their totals', () => {
    renderRoute('/competition?year=2025');
    expect(
      screen.getByRole('heading', { name: '2025 年度概览' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '区域分布' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '参赛组别' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '队伍地域明细' }),
    ).toBeInTheDocument();
  });

  it('labels empty award results as unknown for the live season', () => {
    renderRoute('/competition?year=2026');
    expect(screen.getByText('未公开 / 无返回')).toBeInTheDocument();
  });

  it('switches the year through the filter panel', async () => {
    const user = userEvent.setup();
    renderRoute('/competition?year=2025');
    await user.selectOptions(screen.getByLabelText('选择年份'), '2024');
    expect(
      screen.getByRole('heading', { name: '2024 年度概览' }),
    ).toBeInTheDocument();
  });
});

describe('AwardsPage interactions', () => {
  it('switches the decision filter through the panel', async () => {
    const user = userEvent.setup();
    renderRoute('/awards?year=2025&decision=winner');
    await user.selectOptions(screen.getByLabelText('结果'), 'nominee');
    expect(document.querySelector('.record-count')?.textContent).toMatch(
      /^\d[\d,]* 条队伍结果$/,
    );
    expect(screen.queryByText('13 条队伍结果')).not.toBeInTheDocument();
  });
});

describe('PeoplePage pagination', () => {
  it('pages through the member index', async () => {
    const user = userEvent.setup();
    renderRoute('/people');
    const next = screen.getByRole('button', { name: '下一页' });
    await user.click(next);
    expect(
      screen.getByRole('button', { name: '2' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
