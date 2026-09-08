import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { database } from './data';

function renderRoute(route: string) {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <App />
    </MemoryRouter>,
  );
}

describe('application routes', () => {
  it('renders the rebuilt iGEM archive home page', () => {
    renderRoute('/');
    expect(
      screen.getByRole('heading', {
        name: '让竞赛记录，成为可以查证的公共档案。',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('26')[0]).toBeInTheDocument();
    expect(screen.queryByText(/OIerDb NG/)).not.toBeInTheDocument();
  });

  it('filters the team directory through shareable query state', () => {
    renderRoute('/teams?q=Stony');
    expect(
      screen.getByRole('link', { name: 'Stony-Brook' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 条记录')).toBeInTheDocument();
  });

  it('opens a team detail page and exposes public roster semantics', () => {
    const team = database.teamById.get(5587);
    expect(team).toBeDefined();
    renderRoute('/teams/5587');
    expect(
      screen.getByRole('heading', { level: 1, name: team?.name }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '公开成员' }),
    ).toBeInTheDocument();
  });

  it('supports keyboard-accessible global search', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await user.click(screen.getByRole('button', { name: /全站检索/ }));
    const input = screen.getByRole('textbox', { name: '检索队伍、成员或机构' });
    await user.type(input, 'Alexa');
    expect(
      screen.getByRole('link', { name: /Alexa Stermann/ }),
    ).toBeInTheDocument();
  });
});
