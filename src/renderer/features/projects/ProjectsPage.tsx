import { useEffect, useRef, useState } from 'react';
import type { AssetVersion, Project, ProjectInput } from '../../../shared/domain';
import { projectPayloadSchema } from '../../../shared/schemas';
import { EmptyState } from '../../components/EmptyState';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { ResourceView } from '../assets/ResourceView';
import { ProjectEditor } from './ProjectEditor';
import { ProjectImportWizard } from './ProjectImportWizard';

function versionProject(version: AssetVersion): ProjectInput | null {
  try {
    const decoded: unknown = JSON.parse(version.snapshot);
    const parsed = projectPayloadSchema.safeParse(decoded);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function ProjectsPage() {
  const projects = useAsyncResource(() => window.jobSearch.assets.projects.list());
  const toast = useToast();
  const [editing, setEditing] = useState<Project | null | undefined>(undefined);
  const [selected, setSelected] = useState<Project | null>(null);
  const [versions, setVersions] = useState<AssetVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [organizingProject, setOrganizingProject] = useState<Project | undefined>(undefined);
  const versionsRequestId = useRef(0);

  useEffect(() => () => {
    versionsRequestId.current += 1;
  }, []);

  const loadVersions = async (project: Project) => {
    const requestId = ++versionsRequestId.current;
    setVersions([]);
    setVersionsError(false);
    setVersionsLoading(true);
    try {
      const loaded = await window.jobSearch.assets.versions('project', project.id);
      if (requestId === versionsRequestId.current) setVersions(loaded);
    } catch {
      if (requestId === versionsRequestId.current) {
        setVersionsError(true);
        toast.error('载入项目历史失败，请稍后重试');
      }
    } finally {
      if (requestId === versionsRequestId.current) setVersionsLoading(false);
    }
  };

  const openProject = async (project: Project) => {
    setSelected(project);
    await loadVersions(project);
  };

  const save = async (input: ProjectInput) => {
    try {
      const saved = await window.jobSearch.assets.projects.save({
        ...input,
        ...(editing ? { id: editing.id } : {}),
      });
      setEditing(undefined);
      setSelected(saved);
      const refreshed = await projects.reload();
      if (refreshed) {
        setSelected(refreshed.find((item) => item.id === saved.id) ?? saved);
      }
      await loadVersions(saved);
      toast.success('项目档案已保存');
    } catch {
      toast.error('保存项目失败，请稍后重试');
      throw new Error('project save failed');
    }
  };

  const addButton = (
    <button className="button button--primary" onClick={() => setEditing(null)} type="button">
      新增项目
    </button>
  );

  const narrativeSections = selected ? [
    {
      label: '项目概述',
      fields: [
        ['项目时间', selected.projectTime ?? ''],
        ['背景', selected.background],
        ['目标', selected.goal],
        ['角色', selected.role],
      ],
    },
    {
      label: '行动与决策',
      fields: [['关键决策', selected.keyDecisions]],
    },
    {
      label: '结果与证据',
      fields: [
        ['结果', selected.outcome],
        ['证据', selected.evidence],
      ],
    },
    {
      label: '复盘与表达',
      fields: [
        ['反思', selected.reflections],
        ['讲述版本（附加叙事）', selected.storytellingVersions],
      ],
    },
  ] : [];

  return (
    <div className="assets-page projects-page">
      <header className="page-heading">
        <div>
          <p className="section-label">PROJECT EVIDENCE / 项目证据</p>
          <h2>把经历整理成可靠证据</h2>
          <p>这里只维护项目事实与表达底稿，不修改简历；每次实际内容变化都会留下上一版。</p>
        </div>
        <span className="button-cluster">
          <button className="button button--quiet" onClick={() => {
            setOrganizingProject(undefined);
            setImportOpen(true);
          }} type="button">
            从文件导入
          </button>
          {addButton}
        </span>
      </header>

      <ResourceView
        empty={(projects.data?.length ?? 0) === 0}
        emptyAction={addButton}
        emptyBody="记录第一个项目的背景、决策、结果与证据。"
        emptyTitle="还没有项目档案"
        error={projects.error}
        errorTitle="项目档案载入失败"
        loading={projects.loading}
        loadingLabel="正在读取项目档案…"
      >
        <div className="asset-split">
          <section aria-label="项目列表" className="asset-list">
            {projects.data?.map((project) => (
              <article
                aria-label={`PROJECT / ${project.updatedAt.slice(0, 10)}`}
                className="asset-card project-row"
                key={project.id}
              >
                <p className="asset-card__index">PROJECT / {project.updatedAt.slice(0, 10)}</p>
                <h3 className="user-text">{project.name}</h3>
                <p className="project-row__intro">
                  {[project.projectTime, project.role].filter(Boolean).length ? (
                    <>
                      <span className="project-row__meta user-text">
                        {[project.projectTime, project.role].filter(Boolean).join(' · ')}
                      </span>
                      <span aria-hidden="true"> / </span>
                    </>
                  ) : null}
                  <span className="user-text">
                    {project.background || project.unclassifiedNotes || project.outcome || '尚未记录项目内容'}
                  </span>
                  {project.background && project.outcome ? (
                    <>
                      <span aria-hidden="true"> / </span>
                      <span className="user-text">{project.outcome}</span>
                    </>
                  ) : null}
                </p>
                <button
                  aria-label={`查看 ${project.name}`}
                  className="text-button"
                  onClick={() => void openProject(project)}
                  type="button"
                >
                  查看档案
                </button>
              </article>
            ))}
          </section>

          <aside aria-label="项目详情与历史" className="asset-detail">
            {selected ? (
              <>
                <div className="asset-detail__heading">
                  <div>
                    <p className="section-label">ACTIVE FILE / 当前档案</p>
                    <h3 className="user-text">{selected.name}</h3>
                  </div>
                  <span className="button-cluster">
                    <button className="button button--quiet" onClick={() => {
                      setOrganizingProject(selected);
                      setImportOpen(true);
                    }} type="button">
                      AI 整理
                    </button>
                    <button className="button button--quiet" onClick={() => setEditing(selected)} type="button">
                      编辑项目
                    </button>
                  </span>
                </div>
                <div className="narrative-sections">
                  {narrativeSections.map(({ label, fields }) => (
                    <section aria-label={label} className="narrative-block" key={label}>
                      <h4>{label}</h4>
                      <dl className="narrative-grid">
                        {fields.map(([fieldLabel, content]) => (
                          <div key={fieldLabel}>
                            <dt>{fieldLabel}</dt>
                            <dd className="user-text">{content || '—'}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                </div>
                <section aria-label="项目内容" className="supplemental-narrative">
                  <h4>项目内容</h4>
                  <p className="user-text">{selected.unclassifiedNotes || '—'}</p>
                </section>
                <section className="version-history" aria-label="只读历史">
                  <div className="version-history__heading">
                    <h4>只读历史</h4>
                    <span>{versions.length} 个版本</span>
                  </div>
                  {versionsLoading ? <p role="status">正在读取历史…</p> : null}
                  {!versionsLoading && versionsError ? (
                    <div className="version-history__error" role="alert">
                      <h5>项目历史载入失败</h5>
                      <p>当前档案仍可查看和编辑；请重试历史读取。</p>
                      <button
                        className="button button--quiet"
                        onClick={() => void loadVersions(selected)}
                        type="button"
                      >
                        重试项目历史
                      </button>
                    </div>
                  ) : null}
                  {!versionsLoading && !versionsError && versions.length === 0
                    ? <p>当前还没有历史版本。</p>
                    : null}
                  {!versionsError ? versions.map((version) => {
                    const snapshot = versionProject(version);
                    const headingId = `project-version-${version.id}`;
                    return (
                      <article aria-labelledby={headingId} key={version.id}>
                        <div className="version-history__meta">
                          <h5 id={headingId}>历史版本 {version.version}</h5>
                          <time dateTime={version.createdAt}>{version.createdAt.slice(0, 10)}</time>
                        </div>
                        {snapshot ? (
                          <dl className="version-narrative">
                            {[
                              ['项目名称', snapshot.name],
                              ['背景', snapshot.background],
                              ['目标', snapshot.goal],
                              ['角色', snapshot.role],
                              ['关键决策', snapshot.keyDecisions],
                              ['结果', snapshot.outcome],
                              ['证据', snapshot.evidence],
                              ['反思', snapshot.reflections],
                              ['讲述版本（附加叙事）', snapshot.storytellingVersions],
                              ['\u9879\u76ee\u65f6\u95f4', snapshot.projectTime],
                              ['\u9879\u76ee\u5185\u5bb9', snapshot.unclassifiedNotes],
                            ].map(([label, content]) => (
                              <div key={label}>
                                <dt>{label}</dt>
                                <dd className="user-text">{content || '—'}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : <p>该历史版本无法读取。</p>}
                      </article>
                    );
                  }) : null}
                </section>
              </>
            ) : (
              <EmptyState
                body="从左侧选择一个项目，查看完整叙事与只读版本历史。"
                icon="项"
                title="选择一份项目档案"
              />
            )}
          </aside>
        </div>
      </ResourceView>

      <ProjectEditor
        initialValue={editing ?? undefined}
        onClose={() => setEditing(undefined)}
        onSave={save}
        open={editing !== undefined}
      />
      <ProjectImportWizard
        existingProject={organizingProject}
        onClose={() => {
          setImportOpen(false);
          setOrganizingProject(undefined);
        }}
        onCompleted={async () => {
          const refreshed = await projects.reload();
          if (organizingProject) {
            const next = refreshed?.find((item) => item.id === organizingProject.id);
            if (next) {
              setSelected(next);
              await loadVersions(next);
            }
            toast.success('项目已完成 AI 整理');
          } else {
            toast.success('项目文件已导入');
          }
          setImportOpen(false);
          setOrganizingProject(undefined);
        }}
        open={importOpen}
      />
    </div>
  );
}
