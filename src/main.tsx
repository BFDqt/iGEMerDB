import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { loadCoreDatabase } from './app/dataBundles';
import './styles.css';

const root = document.getElementById('app');

if (!root) throw new Error('Application root was not found.');

const reactRoot = ReactDOM.createRoot(root);

function renderStatus(title: string, detail: string) {
  reactRoot.render(
    <main className="boot-status" aria-live="polite">
      <span>iGEMerDB / DATA ARCHIVE</span>
      <h1>{title}</h1>
      <p>{detail}</p>
    </main>,
  );
}

renderStatus(
  '正在打开竞赛档案',
  '载入队伍目录与年度索引；详细名单将在需要时读取。',
);

loadCoreDatabase()
  .then(() => {
    reactRoot.render(
      <React.StrictMode>
        <BrowserRouter
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        >
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '未知错误';
    renderStatus(
      '档案载入失败',
      `${message}。请确认 /data/web/core.json 已随站点发布。`,
    );
  });
