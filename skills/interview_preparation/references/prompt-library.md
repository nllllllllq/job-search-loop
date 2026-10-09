# 完整 JD 分析 prompt

在阅读版第二板块执行以下分析，保留全部要求；篇幅压缩不等于丢弃项目。

```text
Read the Job Description (JD) that I will paste in a followup prompt.

Include the following in your analysis:

1. Map Competencies: From standard competencies (e.g., Communication, Leadership, Problem Solving, Strategic Thinking), identify the 5 most relevant. Rank them 1-5 based on keyword frequency, placement, and emphasis. Show results in a table.
2. Company Map: Place the employer in the STARS model (Startup, Turnaround, Realignment, Sustaining Success, Crisis). Summarize stage, priorities, and culture.
3. Dream Candidate Avatar:

-Typical Day (timeline of tasks)

-Superpower (solves JD's biggest pain point, in simple terms)

-Success Story (using that superpower)

-Quote (reflecting belief system)

-Pain Profile (why role exists + how candidate fixes it)

4. Action Guide:

-A tagline for self-intro

-A culture-fit phrase for interviews

-3 tailored interview questions to ask at the end
```

## 执行边界

- 用户提供的原始 prompt 是第二板块的完整输出契约。按上述四项顺序明确展示，不能只保留近似主题或将字段散落到别的板块。首句的“followup”是原文措辞；当前已有 JD 时直接分析，不再次等待用户粘贴。
- 能力从标准胜任力选取正好五项，不用“五项岗位任务”代替。每项给标准名称及中文解释、JD 原文证据，以及重复、位置与强调的排序理由。可计数时说明关键词和统计范围；无法精确计数时不编词频。词频不是唯一排序标准，也不是公司评分。
- Company Map 先明确雇主公司的 STARS 阶段，再按需单独判断岗位所在业务；不能只分析海外分部来代替雇主公司。明确展示 Stage、Priorities、Culture；结合当前公开业务证据，给简短置信度及必要备选。文化推断以 JD 或官方材料为依据，不能推定真实团队作息。
- Typical Day 是职责驱动的工作情境，标注模拟，不声称实际作息。
- 在同一个 Dream Candidate Avatar 下，依次明确展示 Typical Day、Superpower、Success Story、Quote、Pain Profile。Superpower、Pain Profile 和 Success Story 接在同一业务逻辑上；Pain Profile 同时说明岗位为什么存在及候选人怎样解决。无简历时，Success Story 写成理想交付示例，标注假设，不使用第一人称虚构过去经历或收益数字，不增加待填写模板。
- 理想候选人画像与产品用户画像不同。前者回答岗位想找谁；后者用简短任务型假设解释产品服务谁，不能凭空给人口统计。
- Action Guide 必须包括一句自我介绍 tagline、一句文化适配表达和三个清晰分开的岗位反问；tagline 是候选人可选用的能力主张，输出本身不可省略，需要真实证据支持。文化适配句不引导对地点、作息或职业意愿作不实承诺。
- 三个反问紧扣当前业务、协作决策与新人成功标准，不再另建反问题库。

## 简短调用方式

```text
使用 interview_preparation，针对下面的岗位直接制作阅读版面试准备网页。
请保留原始 JD 和可点击高亮，按“快速总览、岗位能力与画像、五道业务题、产品与市场调研”组织，30 分钟内可读完。
保留完整 JD 分析 prompt 的结果，财报数字给原始出处，不加填写、计时或学习管理功能。

岗位 JD：
（附文字或截图）

可选备考线索：
（附同事建议或面经；没有也可继续）
```
