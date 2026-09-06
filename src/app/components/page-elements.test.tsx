import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  Breadcrumbs,
  DistributionBars,
  EmptyState,
  PageHeader,
  Pagination,
  useDocumentTitle,
} from './PageElements';
import { DatasetNotice } from './PageElements';

function TitleProbe({ title }: { title: string }) {
  useDocumentTitle(title);
  return null;
}

describe('PageHeader', () => {
  it('renders kicker, title, description and the record count', () => {
    render(
      <PageHeader
        kicker="TEST / 2025"
        title="页面标题"
        description="说明文字"
        action={<span className="record-count">42 条记录</span>}
      />,
    );
    expect(screen.getByText('TEST / 2025')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '页面标题' }),
    ).toBeInTheDocument();
    expect(screen.getByText('说明文字')).toBeInTheDocument();
    expect(screen.getByText('42 条记录')).toBeInTheDocument();
  });
});

describe('Breadcrumbs', () => {
  it('keeps a home link plus labelled trail', () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true }}>
        <Breadcrumbs items={[{ label: '队伍目录', to: '/teams' }, { label: 'Aachen' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: '面包屑' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '首页' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '队伍目录' })).toBeInTheDocument();
    expect(screen.getByText('Aachen')).toBeInTheDocument();
  });
});

describe('DatasetNotice', () => {
  it('explains the snapshot range and live-season caveat', () => {
    render(<DatasetNotice />);
    expect(screen.getByText('覆盖范围提示')).toBeInTheDocument();
    expect(screen.getByText(/2008–2026 年、共 8 届赛事/)).toBeInTheDocument();
    expect(screen.getByText(/2026 年为进行中赛季/)).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('supports custom copy', () => {
    render(<EmptyState title="没有结果" description="换个筛选试试。" />);
    expect(screen.getByText('没有结果')).toBeInTheDocument();
    expect(screen.getByText('换个筛选试试。')).toBeInTheDocument();
  });
});

describe('Pagination', () => {
  it('returns null when everything fits on one page', () => {
    const { container } = render(
      <Pagination page={1} total={30} pageSize={50} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('paginates, collapses distant pages, and reports clicks', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={4} total={500} pageSize={50} onChange={onChange} />);

    expect(screen.getByRole('navigation', { name: '分页' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '8' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await user.click(screen.getByRole('button', { name: '下一页' }));
    expect(onChange).toHaveBeenLastCalledWith(5);
    await user.click(screen.getByRole('button', { name: '上一页' }));
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled();
  });

  it('disables the previous button on the first page', () => {
    render(<Pagination page={1} total={500} pageSize={50} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
  });
});

describe('DistributionBars', () => {
  it('renders one scaled bar per row with its label and value', () => {
    render(
      <DistributionBars
        rows={[
          { label: 'Europe', value: 10, detail: '10 队' },
          { label: 'unknown', value: 0 },
        ]}
      />,
    );
    expect(screen.getByText('Europe')).toBeInTheDocument();
    expect(screen.getByText('10 队')).toBeInTheDocument();
    const tracks = document.querySelectorAll<HTMLDivElement>('.bar-track');
    expect(tracks).toHaveLength(2);
    const fills = tracks[0].querySelector('span');
    expect(fills).toHaveStyle({ width: '100%' });
    expect(tracks[1].querySelector('span')).toHaveStyle({ width: '0%' });
  });
});

describe('useDocumentTitle', () => {
  it('suffixes the site name and restores the previous title', () => {
    const previous = document.title;
    const { rerender } = render(<TitleProbe title="测试页面" />);
    expect(document.title).toBe('测试页面 — iGEMerDB');
    rerender(<TitleProbe title="" />);
    expect(document.title).toBe('iGEMerDB — iGEM 竞赛资料库');
    document.title = previous;
  });
});
