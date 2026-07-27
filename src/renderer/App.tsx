import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { EmptyState } from './components/EmptyState';
import { CapabilitiesPanel } from './features/capabilities/CapabilitiesPanel';
import { InsightsPage } from './features/insights/InsightsPage';
import { PositionDetailPage } from './features/positions/PositionDetailPage';
import { PositionsPage } from './features/positions/PositionsPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { QuestionsPage } from './features/questions/QuestionsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ToastProvider } from './hooks/useToast';

interface PlaceholderConfig {
  title: string;
  body: string;
  icon: string;
  note: string;
}

const placeholders: Record<string, PlaceholderConfig> = {
  reviews: {
    title: '复盘从一次真实对话开始',
    body: '面试结束后，这里将承接逐轮记录、个人判断与后续沉淀，保留当时最鲜活的细节。',
    icon: '复',
    note: '记录事实，再提炼方法',
  },
};

function OverviewPage() {
  return (
    <div className="overview-page">
      <section className="overview-intro" aria-labelledby="overview-intro-title">
        <div>
          <p className="section-label">本期焦点 / ISSUE NO. 01</p>
          <h2 id="overview-intro-title">
            把每一次求职行动，
            <br />
            变成下一次的底气。
          </h2>
        </div>
        <p>
          在一个只属于你的本地工作台里，记录岗位进展、复盘真实对话，并让项目经验逐渐成为可靠的表达素材。
        </p>
      </section>
      <div className="overview-ledger" aria-label="工作方法">
        <article>
          <span>01</span>
          <h3>追踪</h3>
          <p>记住机会走到哪里，也记住为什么出发。</p>
        </article>
        <article>
          <span>02</span>
          <h3>复盘</h3>
          <p>把感受拆成事实、判断与下一步练习。</p>
        </article>
        <article>
          <span>03</span>
          <h3>沉淀</h3>
          <p>让项目、问题与心得互相提供证据。</p>
        </article>
      </div>
      <EmptyState
        body="岗位模块将在下一阶段承接第一条目标记录。现在先熟悉这套以记录、复盘和沉淀为主线的工作方式。"
        icon="启"
        title="从一条真实机会开始"
      />
    </div>
  );
}

function PlaceholderPage({ config }: { config: PlaceholderConfig }) {
  return (
    <div className="placeholder-page">
      <p className="section-label">模块导览 / FIELD NOTE</p>
      <EmptyState
        body={
          <>
            <p>{config.body}</p>
            <p className="empty-state__note">{config.note}</p>
          </>
        }
        icon={config.icon}
        title={config.title}
      />
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="placeholder-page">
      <p className="section-label">404 / LOST PAGE</p>
      <EmptyState
        action={
          <Link className="button-link" to="/">
            返回总览
          </Link>
        }
        body="这个地址不在当前工作台中。你可以返回总览，继续整理求职记录。"
        icon="？"
        title="没有找到这个页面"
      />
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route
              path="/positions"
              element={<PositionsPage />}
            />
            <Route path="/positions/:id" element={<PositionDetailPage />} />
            <Route
              path="/reviews"
              element={<PlaceholderPage config={placeholders.reviews} />}
            />
            <Route
              path="/projects"
              element={<ProjectsPage />}
            />
            <Route
              path="/questions"
              element={<QuestionsPage />}
            />
            <Route path="/capabilities" element={<CapabilitiesPanel />} />
            <Route
              path="/insights"
              element={<InsightsPage />}
            />
            <Route
              path="/settings"
              element={<SettingsPage />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </ToastProvider>
    </HashRouter>
  );
}
