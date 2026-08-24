import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { EmptyState } from './components/EmptyState';
import { InsightsPage } from './features/insights/InsightsPage';
import { PositionDetailPage } from './features/positions/PositionDetailPage';
import { PositionsPage } from './features/positions/PositionsPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { QuestionsPage } from './features/questions/QuestionsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ToastProvider } from './hooks/useToast';
import { DashboardPage } from './features/dashboard/DashboardPage';

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
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/positions"
              element={<PositionsPage />}
            />
            <Route path="/positions/:id" element={<PositionDetailPage />} />
            <Route path="/reviews" element={<Navigate replace to="/" />} />
            <Route
              path="/projects"
              element={<ProjectsPage />}
            />
            <Route
              path="/questions"
              element={<QuestionsPage />}
            />
            <Route path="/capabilities" element={<Navigate replace to="/?drawer=capabilities" />} />
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
