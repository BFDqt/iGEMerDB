import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PeopleDataBoundary,
  PersonDataBoundary,
  TeamDataBoundary,
} from './DataBoundary';
import { loadCoreDatabase } from '../dataBundles';
import { buildCompactBundle, memberRow } from '../test/bundle-fixtures';
import source from '../test/fixtures/test_export.json';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const body = handler(String(input));
      if (body instanceof Promise) {
        return body;
      }
      if (body === undefined) {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
}

function renderRoute(
  pattern: string,
  route: string,
  boundary: React.ReactElement,
) {
  render(
    <MemoryRouter initialEntries={[route]} future={{ v7_relativeSplatPath: true }}>
      <Routes>
        <Route path={pattern} element={boundary} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DataBoundary', () => {
  it('renders children directly while no core bundle has been loaded', () => {
    stubFetch(() => undefined);
    renderRoute(
      '/people/:personId',
      '/people/any-person',
      <PersonDataBoundary>
        <div>READY-CONTENT</div>
      </PersonDataBoundary>,
    );
    expect(screen.getByText('READY-CONTENT')).toBeInTheDocument();
  });

  it('keeps a pending shard visible as a labelled loading state', async () => {
    stubFetch((url) => {
      if (url.endsWith('core.json')) return source;
      return new Promise(() => {});
    });
    await loadCoreDatabase();

    renderRoute(
      '/people/:personId',
      '/people/pending-person',
      <PersonDataBoundary>
        <div>PENDING-CONTENT</div>
      </PersonDataBoundary>,
    );

    expect(await screen.findByText('正在载入成员档案')).toBeInTheDocument();
    expect(screen.queryByText('PENDING-CONTENT')).not.toBeInTheDocument();
  });

  it('offers a retry after a shard request fails', async () => {
    const user = userEvent.setup();
    let failing = true;
    stubFetch((url) => {
      if (url.endsWith('core.json')) return source;
      return failing ? undefined : buildCompactBundle([], []);
    });
    await loadCoreDatabase();

    renderRoute(
      '/people/:personId',
      '/people/failing-person',
      <PersonDataBoundary>
        <div>RETRY-CONTENT</div>
      </PersonDataBoundary>,
    );
    expect(await screen.findByText('数据分片载入失败')).toBeInTheDocument();
    expect(screen.queryByText('RETRY-CONTENT')).not.toBeInTheDocument();

    failing = false;
    await user.click(screen.getByRole('button', { name: /重新载入/ }));
    await waitFor(() =>
      expect(screen.getByText('RETRY-CONTENT')).toBeInTheDocument(),
    );
  });

  it('exposes the team loading state politely', async () => {
    stubFetch((url) => {
      if (url.endsWith('core.json')) return source;
      return new Promise(() => {});
    });
    await loadCoreDatabase();

    renderRoute(
      '/teams/:teamId',
      '/teams/5587',
      <TeamDataBoundary>
        <div>TEAM-CONTENT</div>
      </TeamDataBoundary>,
    );

    expect(await screen.findByText('正在载入队伍名单')).toBeInTheDocument();
    const status = document.querySelector('.route-data-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('renders children once the complete people index has loaded', async () => {
    stubFetch((url) => {
      if (url.endsWith('core.json')) return source;
      if (url.endsWith('people.json')) {
        return buildCompactBundle([memberRow('mem-index', 'Index Person')], []);
      }
      return undefined;
    });
    await loadCoreDatabase();

    renderRoute(
      '*',
      '/people',
      <PeopleDataBoundary>
        <div>PEOPLE-CONTENT</div>
      </PeopleDataBoundary>,
    );

    await waitFor(() =>
      expect(screen.getByText('PEOPLE-CONTENT')).toBeInTheDocument(),
    );
  });
});
