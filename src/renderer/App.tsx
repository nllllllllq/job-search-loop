import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';

const navigation = [
  { label: '总览', to: '/' },
  { label: '岗位', to: '/positions' },
  { label: '复盘中心', to: '/reviews' },
  { label: '项目档案', to: '/projects' },
  { label: '问题库', to: '/questions' },
  { label: '随想与心得', to: '/insights' },
  { label: '设置', to: '/settings' },
];

function OverviewPage() {
  return (
    <section className="overview" aria-labelledby="overview-heading">
      <p className="eyebrow">你的求职学习闭环</p>
      <h1 id="overview-heading">从每一次准备，到下一次更从容的表达。</h1>
      <p className="overview-copy">
        在这里记录岗位进展、沉淀项目经验，并把复盘转化为下一次面试可复用的素材。
      </p>
      <div className="overview-note">
        <span aria-hidden="true">01</span>
        <p>从「岗位」开始添加第一份目标职位。</p>
      </div>
    </section>
  );
}

function PlaceholderPage({ label }: { label: string }) {
  return (
    <section className="placeholder-page" aria-labelledby="placeholder-heading">
      <p className="eyebrow">即将就绪</p>
      <h1 id="placeholder-heading">{label}</h1>
      <p>这个模块会在后续版本中逐步完善。</p>
    </section>
  );
}

export function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <aside className="sidebar" aria-label="主导航">
          <a className="wordmark" href="#/" aria-label="求职闭环首页">
            <span className="wordmark-mark" aria-hidden="true">J</span>
            <span>求职闭环</span>
          </a>
          <nav>
            <ul className="navigation-list">
              {navigation.map(({ label, to }, index) => (
                <li key={to}>
                  <NavLink
                    className={({ isActive }) =>
                      `navigation-link${isActive ? ' navigation-link--active' : ''}`
                    }
                    end={to === '/'}
                    to={to}
                  >
                    <span className="navigation-index" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <p className="sidebar-footer">LOCAL FIRST · V0.1</p>
        </aside>
        <main className="content-frame">
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            {navigation.slice(1).map(({ label, to }) => (
              <Route key={to} path={to} element={<PlaceholderPage label={label} />} />
            ))}
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
