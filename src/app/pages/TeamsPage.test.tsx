import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import source from '../test/fixtures/test_export.json';
import { initializeDatabase } from '../data';
import type { RawDataset } from '../types';
import { TeamsPage } from './TeamsPage';

afterEach(() => initializeDatabase(source as RawDataset));

describe('team status isolation', () => {
  it('keeps withdrawn teams out of the default view and reveals them through All', async () => {
    const user = userEvent.setup();
    const fixture = structuredClone(source) as RawDataset;
    fixture.meta = {
      generated_at: '',
      source: '',
      coverage: [],
      ...fixture.meta,
      schema_version: 3,
    };
    fixture.teams = fixture.teams.slice(0, 2).map((team, index) => ({
      ...team,
      name: index === 0 ? 'UI-Accepted-Test' : 'UI-Withdrawn-Test',
      status: index === 0 ? 'accepted' : 'withdrawn',
      export_category: index === 0 ? 'accepted' : 'withdrawn',
      default_visible: index === 0,
    }));
    initializeDatabase(fixture);

    render(
      <MemoryRouter
        initialEntries={['/teams?q=UI-Withdrawn-Test']}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <TeamsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText('UI-Withdrawn-Test')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('队伍状态'), 'all');
    const withdrawnLink = screen.getByRole('link', {
      name: 'UI-Withdrawn-Test',
    });
    expect(withdrawnLink).toBeInTheDocument();
    expect(withdrawnLink.closest('tr')).toHaveTextContent('已撤回');
  });
});
