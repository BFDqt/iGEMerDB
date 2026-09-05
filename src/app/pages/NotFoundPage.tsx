import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../components/PageElements';

export function NotFoundPage() {
  useDocumentTitle('页面未找到');
  return (
    <div className="not-found-page">
      <div>
        <span>404</span>
        <small>RECORD NOT FOUND</small>
      </div>
      <section>
        <h1>这里没有可显示的记录。</h1>
        <p>链接可能已失效，或者对应实体不在当前公开数据快照中。</p>
        <Link className="button-link" to="/">
          <ArrowLeft aria-hidden="true" /> 返回首页
        </Link>
      </section>
    </div>
  );
}
