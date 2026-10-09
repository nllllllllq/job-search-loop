# interview_preparation

为具体岗位制作以阅读为主的面试准备网页，默认半小时内读完。

## 内容

- 快速总览：岗位使命、业务现状与三项重点。
- 完整 JD 分析：五项胜任力排名、STARS 公司判断、理想候选人五字段、行动指南与三个反问。
- 五道业务题：直接显示回答主线、示范回答、指标与追问。
- 产品与市场：真实产品素材、功能、用户任务、竞品、差异化与有原始出处的财报。

默认单文件 HTML、四个锚点、全文展开；原始 JD 可随时在侧栏查看，关键词可点击高亮。需要时在 JD 下方加入本地保存的随手记。不会虚构候选人经历、市场份额或产品实测。

## 安装到 Codex

在 Codex 中发送：

```text
使用 $skill-installer 安装：
https://github.com/nllllllllq/job-search-loop/tree/interview_preparation/skills/interview_preparation
```

也可使用 Codex 自带安装脚本：

```sh
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo nllllllllq/job-search-loop \
  --ref interview_preparation \
  --path skills/interview_preparation
```

安装后下一轮对话即可调用；如果选择器尚未刷新，再重启 Codex。

## 使用

```text
$interview_preparation
根据下面的岗位 JD 直接制作面试准备网页，控制在半小时内读完。
保留原始 JD 侧栏、高亮，以及 JD 下方的随手记。

岗位 JD：（粘贴文字或附截图）
可选材料：（面经、同事建议、简历或已有网页）
```

简历和面经不是必填。已有网页时可直接要求精简或迭代。用户指定的结构和篇幅优先于默认值。

## 文件

可安装目录：`skills/interview_preparation/`。

```text
SKILL.md
agents/openai.yaml
references/input-output-contract.md
references/prompt-library.md
```

这是 instruction-only skill，无 API Key、账号或第三方运行库要求。生成最新产品与市场调研时，需要运行环境提供可用的联网研究能力；离线时明确资料边界。

当前版本 1.0.0。发布位于本仓库的 `interview_preparation` 分支；安装命令中的 `--ref` 不能省略。名称按作者要求保留下划线。
