import { type ReactNode, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { QuickInsightButton } from './QuickInsightButton';

export const navigation = [
  { code: 'OV', label: '首页', shortLabel: '首页', to: '/' },
  { code: 'PO', label: '岗位', shortLabel: '岗位', to: '/positions' },
  { code: 'PR', label: '项目档案', shortLabel: '项目', to: '/projects' },
  { code: 'QU', label: '问题库', shortLabel: '题库', to: '/questions' },
  { code: 'IN', label: '随想与心得', shortLabel: '随想', to: '/insights' },
  { code: 'ST', label: '设置', shortLabel: '设置', to: '/settings' },
] as const;

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { pathname } = useLocation();
  const normalizedPathname =
    pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const currentPage = navigation.find(({ to }) => (
    to === normalizedPathname
    || (to !== '/' && normalizedPathname.startsWith(`${to}/`))
  ));
  const title = currentPage?.label ?? '未找到页面';
  const documentTitle =
    title === '首页' ? '求职闭环' : `${title} · 求职闭环`;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = documentTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [documentTitle]);

  const skipToContent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const main = document.getElementById('main-content');
    main?.focus();
    main?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={skipToContent}>
        跳到主要内容
      </a>
      <aside className="sidebar" aria-label="主导航">
        <NavLink aria-label="求职闭环首页" className="wordmark" to="/">
          <span className="wordmark__seal" aria-hidden="true">
            职
          </span>
          <span className="wordmark__text">
            <strong>求职闭环</strong>
            <small>FIELD NOTES</small>
          </span>
        </NavLink>
        <nav aria-label="工作区">
          <ul className="navigation-list">
            {navigation.map(({ label, shortLabel, to }) => (
              <li key={to}>
                <NavLink
                  aria-label={label}
                  className={({ isActive }) =>
                    `navigation-link${isActive ? ' navigation-link--active' : ''}`
                  }
                  end={to === '/'}
                  to={to}
                >
                  <span className="navigation-label">{label}</span>
                  <span
                    className="navigation-short-label"
                    aria-hidden="true"
                  >
                    {shortLabel}
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <footer className="sidebar__footer">
          <span className="local-status__dot" aria-hidden="true" />
          <span>
            <strong>数据仅保存在本机</strong>
            <small>LOCAL STORAGE ONLY</small>
          </span>
        </footer>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div>
            <p className="workspace-header__kicker">
              JOB SEARCH FIELD LOG <span aria-hidden="true">/</span> 工作台
            </p>
            <h1>{title}</h1>
          </div>
          <div className="workspace-header__folio" aria-hidden="true">
            <span>PERSONAL</span>
            <strong>01</strong>
          </div>
        </header>
        <main
          className="content-frame"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
        <QuickInsightButton />
      </div>
    </div>
  );
}
