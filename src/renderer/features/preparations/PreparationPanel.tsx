import { useMemo, useState } from 'react';
import type {
  PreparationAssetsSnapshot,
  PreparationHistoricalOutput,
  PreparationMaterial,
  PreparationOutput,
  StarsStage,
} from '../../../shared/domain';
import {
  preparationAssetsSnapshotSchema,
  preparationHistoricalOutputSchema,
} from '../../../shared/schemas';
import { EmptyState } from '../../components/EmptyState';
import { useAsyncResource } from '../../hooks/useAsyncResource';
import { useToast } from '../../hooks/useToast';
import { GeneratePreparationModal } from './GeneratePreparationModal';

interface PreparationPanelProps {
  positionId: string;
}

function parseSnapshot<T>(
  text: string,
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
): T | null {
  try {
    const result = schema.safeParse(JSON.parse(text));
    return result.success ? result.data ?? null : null;
  } catch {
    return null;
  }
}

function OutputSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="preparation-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function generatedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '时间无效';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return '时间无效';
  }
}

function sortableTime(value: string): number {
  const timestamp = new Date(value).valueOf();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

const STARS_STAGE_LABELS: Record<StarsStage, string> = {
  Startup: '创业起步',
  Turnaround: '扭转',
  Realignment: '重新校准',
  'Sustaining Success': '延续成功',
  Crisis: '危机',
};

function isCurrentOutput(
  output: PreparationHistoricalOutput,
): output is PreparationOutput {
  return 'competencyMap' in output;
}

function PreparationVersion({ item }: { item: PreparationMaterial }) {
  const output = parseSnapshot<PreparationHistoricalOutput>(
    item.outputSnapshot,
    preparationHistoricalOutputSchema,
  );
  const assets = parseSnapshot<PreparationAssetsSnapshot>(
    item.assetsSnapshot,
    preparationAssetsSnapshotSchema,
  );
  const projectNames = new Map(
    assets?.projects.map((project) => [project.id, project.name]) ?? [],
  );

  return (
    <article
      aria-label={`准备版本 ${item.generatedAt}`}
      className="preparation-version"
    >
      <header className="preparation-version__header">
        <div>
          <p className="section-label">IMMUTABLE SNAPSHOT / 只读版本</p>
          <time dateTime={item.generatedAt}>
            {generatedTime(item.generatedAt)}
          </time>
        </div>
        <span>{item.modelSnapshot}</span>
      </header>
      {!output || !assets ? (
        <p className="preparation-version__invalid" role="alert">
          这个历史版本的数据无法安全读取。
        </p>
      ) : (
        <>
          <OutputSection title="岗位摘要">
            <h3 className="user-text">{output.roleSummary}</h3>
          </OutputSection>
          <OutputSection title="能力重点">
            {output.capabilityFocus.length === 0 ? <p>—</p> : (
              <dl className="preparation-pairs">
                {output.capabilityFocus.map((item, index) => (
                  <div key={`${item.name}-${index}`}>
                    <dt className="user-text">{item.name}</dt>
                    <dd className="user-text">{item.reason}</dd>
                  </div>
                ))}
              </dl>
            )}
          </OutputSection>
          <OutputSection title="项目讲述要点">
            {output.projectTalkingPoints.length === 0 ? <p>—</p> : (
              <div className="preparation-stacks">
                {output.projectTalkingPoints.map((item) => (
                  <div key={item.projectId}>
                    <h5 className="user-text">
                      {projectNames.get(item.projectId) ?? '历史项目'}
                    </h5>
                    <ul>{item.points.map((point, index) => (
                      <li className="user-text" key={`${point}-${index}`}>{point}</li>
                    ))}</ul>
                  </div>
                ))}
              </div>
            )}
          </OutputSection>
          <OutputSection title="可能问题">
            {output.likelyQuestions.length === 0 ? <p>—</p> : (
              <dl className="preparation-pairs">
                {output.likelyQuestions.map((item, index) => (
                  <div key={`${item.question}-${index}`}>
                    <dt className="user-text">{item.question}</dt>
                    <dd className="user-text">{item.answerOutline}</dd>
                  </div>
                ))}
              </dl>
            )}
          </OutputSection>
          <OutputSection title="候选人反问">
            {output.candidateQuestions.length === 0 ? <p>—</p> : (
              <ul>{output.candidateQuestions.map((item, index) => (
                <li className="user-text" key={`${item}-${index}`}>{item}</li>
              ))}</ul>
            )}
          </OutputSection>
          <OutputSection title="风险提示">
            {output.riskNotes.length === 0 ? <p>—</p> : (
              <ul>{output.riskNotes.map((item, index) => (
                <li className="user-text" key={`${item}-${index}`}>{item}</li>
              ))}</ul>
            )}
          </OutputSection>
          {isCurrentOutput(output) ? (
            <>
              <OutputSection title="Map Competencies">
                <table className="preparation-competency-table">
                  <caption className="sr-only">岗位核心能力 Top 5</caption>
                  <thead>
                    <tr>
                      <th scope="col">排名</th>
                      <th scope="col">能力</th>
                      <th scope="col">JD 证据与理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.competencyMap.map((competency) => (
                      <tr key={competency.rank}>
                        <th scope="row">{competency.rank}</th>
                        <td className="user-text">{competency.name}</td>
                        <td className="user-text">{competency.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </OutputSection>
              <OutputSection title="Company Map">
                <p className="preparation-stage">
                  <strong>
                    {`${output.companyMap.stage} · ${STARS_STAGE_LABELS[output.companyMap.stage]}`}
                  </strong>
                </p>
                <p className="user-text">{output.companyMap.summary}</p>
                <div className="preparation-framework-columns">
                  <div>
                    <h5>优先事项</h5>
                    <ul>{output.companyMap.priorities.map((priority, index) => (
                      <li className="user-text" key={`${priority}-${index}`}>{priority}</li>
                    ))}</ul>
                  </div>
                  <div>
                    <h5>文化信号</h5>
                    <ul>{output.companyMap.culture.map((signal, index) => (
                      <li className="user-text" key={`${signal}-${index}`}>{signal}</li>
                    ))}</ul>
                  </div>
                </div>
              </OutputSection>
              <OutputSection title="Dream Candidate Avatar">
                <h5>Typical Day · 任务时间线</h5>
                <ol className="preparation-timeline" aria-label="Typical Day">
                  {output.dreamCandidateAvatar.typicalDay.map((entry, index) => (
                    <li key={`${entry.time}-${index}`}>
                      <span className="user-text">{entry.time}</span>
                      <div>
                        <strong className="user-text">{entry.activity}</strong>
                        <p className="user-text">{entry.purpose}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <dl className="preparation-pairs">
                  <div>
                    <dt>Superpower</dt>
                    <dd className="user-text">{output.dreamCandidateAvatar.superpower}</dd>
                  </div>
                  <div>
                    <dt>Success Story</dt>
                    <dd className="user-text">{output.dreamCandidateAvatar.successStory}</dd>
                  </div>
                  <div>
                    <dt>Quote</dt>
                    <dd className="user-text">{output.dreamCandidateAvatar.quote}</dd>
                  </div>
                  <div>
                    <dt>Pain Profile</dt>
                    <dd className="user-text">{output.dreamCandidateAvatar.painProfile}</dd>
                  </div>
                </dl>
              </OutputSection>
              <OutputSection title="Action Guide">
                <dl className="preparation-pairs">
                  <div>
                    <dt>自我介绍 Tagline</dt>
                    <dd className="user-text">{output.actionGuide.selfIntroTagline}</dd>
                  </div>
                  <div>
                    <dt>文化匹配表达</dt>
                    <dd className="user-text">{output.actionGuide.cultureFitPhrase}</dd>
                  </div>
                </dl>
                <h5>3 个定制收尾问题</h5>
                <ol aria-label="定制收尾问题">
                  {output.actionGuide.questions.map((question, index) => (
                    <li className="user-text" key={`${question}-${index}`}>{question}</li>
                  ))}
                </ol>
              </OutputSection>
            </>
          ) : (
            <p className="preparation-version__legacy">
              旧版结构 · 此历史版本仅包含基础六部分
            </p>
          )}
          <section className="preparation-input-snapshot">
            <h4>输入快照</h4>
            <p>
              原始 JD {item.rawJdSnapshot.length} 字符 ·
              {assets.projects.length} 个项目 ·
              {assets.questions.length} 个问题 · Prompt {item.promptSnapshot.length} 字符
            </p>
          </section>
        </>
      )}
    </article>
  );
}

export function PreparationPanel({
  positionId,
}: PreparationPanelProps) {
  const toast = useToast();
  const [generateOpen, setGenerateOpen] = useState(false);
  const resource = useAsyncResource(
    () => window.jobSearch.preparations.list(positionId),
    [positionId],
  );
  const history = useMemo(
    () => [...(resource.data ?? [])].sort(
      (left, right) => sortableTime(right.generatedAt) - sortableTime(left.generatedAt)
        || sortableTime(right.createdAt) - sortableTime(left.createdAt),
    ),
    [resource.data],
  );
  const generateButton = (
    <button
      className="button button--primary"
      onClick={() => setGenerateOpen(true)}
      type="button"
    >
      生成准备材料
    </button>
  );

  const generated = async (saved: PreparationMaterial) => {
    setGenerateOpen(false);
    resource.setData((current) => [
      saved,
      ...(current ?? []).filter((item) => item.id !== saved.id),
    ]);
    toast.success('新的准备材料版本已保存');
  };

  return (
    <div className="preparation-panel">
      <header className="preparation-panel__header">
        <div>
          <p className="section-label">PREPARATION ARCHIVE / 准备档案</p>
          <h3>每次生成都是独立的只读版本</h3>
          <p>旧版本不会跟随 JD、项目或问题库的后续修改而变化。</p>
        </div>
        {history.length > 0 ? generateButton : null}
      </header>

      {resource.loading ? (
        <div className="resource-state" role="status">
          <span aria-hidden="true" className="resource-state__mark" />
          正在读取准备材料…
        </div>
      ) : null}
      {resource.error ? (
        <EmptyState
          action={(
            <button
              className="button button--quiet"
              onClick={() => void resource.reload()}
              type="button"
            >
              重试准备材料
            </button>
          )}
          body="暂时无法读取本地准备材料。错误详情不会在页面中暴露。"
          icon="!"
          title="准备材料载入失败"
        />
      ) : null}
      {!resource.loading && !resource.error && history.length === 0 ? (
        <EmptyState
          action={generateButton}
          body="主动选择这次要复用的项目和问题，确认发送摘要后再调用外部 AI。"
          icon="备"
          title="还没有准备材料"
        />
      ) : null}
      {!resource.loading && !resource.error && history.length > 0 ? (
        <div className="preparation-history">
          <PreparationVersion item={history[0]} key={history[0].id} />
          {history.length > 1 ? (
            <details className="position-history">
              <summary>历史准备材料（{history.length - 1}）</summary>
              <div className="position-history__list">
                {history.slice(1).map((item) => (
                  <PreparationVersion item={item} key={item.id} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {generateOpen ? (
        <GeneratePreparationModal
          onClose={() => setGenerateOpen(false)}
          onGenerated={generated}
          open
          positionId={positionId}
        />
      ) : null}
    </div>
  );
}
