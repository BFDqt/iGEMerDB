import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';
import { PersonDetailPage } from './PersonDetailPage';
import { InstitutionDetailPage } from './InstitutionDetailPage';

function renderRoute(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route
          path="/people/:personId"
          element={<PersonDetailPage />}
        />
        <Route
          path="/institutions/:institutionId"
          element={<InstitutionDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PersonDetailPage', () => {
  it('renders the member profile with participation history', () => {
    renderRoute('/people/29169a15-365e-43ad-a3ea-aa1ae797e507');
    expect(
      screen.getByRole('heading', { level: 1, name: 'ZHU KE' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '参赛记录' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '公开资料' }),
    ).toBeInTheDocument();
    // The prolific fixture member spans multiple teams and years.
    expect(screen.getAllByText(/202\d/).length).toBeGreaterThan(0);
  });

  it('explains that an unknown member id has no record', () => {
    renderRoute('/people/does-not-exist');
    expect(
      screen.getByRole('heading', { level: 1, name: '没有找到这位成员' }),
    ).toBeInTheDocument();
  });
});

describe('InstitutionDetailPage', () => {
  it('renders the institution with its official team links', () => {
    renderRoute('/institutions/RWTH%20Aachen%20University');
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'RWTH Aachen University',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '官方字段关联队伍' }),
    ).toBeInTheDocument();
    const teamLinks = screen.getAllByRole('link', { name: /Aachen/ });
    expect(teamLinks.length).toBeGreaterThan(0);
    expect(teamLinks[0]).toHaveAttribute('href', expect.stringContaining('/teams/'));
  });

  it('explains that an unknown institution id has no record', () => {
    renderRoute('/institutions/Nowhere%20University');
    expect(
      screen.getByRole('heading', { level: 1, name: '没有找到这个机构' }),
    ).toBeInTheDocument();
  });
});

describe('NotFoundPage', () => {
  it('offers a way back to the directory', () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true }}>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole('heading', { name: '这里没有可显示的记录。' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /返回/ })).toBeInTheDocument();
  });
});
