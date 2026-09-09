import React, { useEffect, useMemo, useState } from "react";
import "./evaluation-editor";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./evaluation.css";
import { evaluate, options, ScoreKey } from "./rules";

const api = async (path: string, init?: RequestInit) => {
  const r = await fetch(path, init);
  if (!r.ok) throw new Error((await r.json()).error || "请求失败");
  return r.json();
};
const labels: Record<string, string> = {
  meetingLevel: "会议级别",
  academicBenefit: "学术权益",
  expertLevel: "专家层级",
  productType: "产品类型",
  hospitalValue: "医院战略价值",
  monthlySales: "月均销量",
  salesTrend: "销量趋势",
  growthOpportunity: "增长机会",
  communication: "传播价值",
  execution: "执行质量",
};
function App() {
  const [tab, setTab] = useState("overview");
  const [apps, setApps] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>();
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState("评估员");
  const load = () =>
    api("/api/applications")
      .then(setApps)
      .catch((e) => setNotice(e.message));
  useEffect(() => {
    load();
  }, []);
  const demo = async () => {
    const a = await api("/api/applications/demo", { method: "POST" });
    setSelected(await api("/api/applications/" + a.id));
    setTab("review");
    load();
  };
  const create = async () => {
    const a = await api("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectName: "新资源支持申请" }),
    });
    setSelected(a);
    setTab("extract");
    load();
  };
  const open = (a: any) =>
    api("/api/applications/" + a.id).then((x) => {
      setSelected(x);
      setTab("review");
    });
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="brandMark">AI</span>
          <div>
            <b>审批智评</b>
            <small>Approval Insight</small>
          </div>
        </div>
        <div className="workspace">
          资源支持审批中心 <span>⌄</span>
        </div>
        <nav>
          {[
            ["overview", "总览工作台", "▦"],
            ["extract", "申请识别", "⌁"],
            ["review", "评分确认", "✓"],
            ["approval", "审批决策", "↗"],
            ["ledger", "投入台账", "▤"],
            ["post", "会后复盘", "◒"],
          ].map(([id, text, icon]) => (
            <button
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
              key={id}
            >
              <i>{icon}</i>
              {text}
            </button>
          ))}
        </nav>
        <div className="sideFooter">
          <div className="avatar">评</div>
          <div>
            <b>市场部评估员</b>
            <small>当前角色：{role}</small>
          </div>
          <span>⋮</span>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="crumb">资源审批中心 / </span>
            <strong>
              {tab === "overview"
                ? "总览工作台"
                : tab === "extract"
                  ? "申请识别"
                  : tab === "review"
                    ? "评分确认"
                    : tab === "approval"
                      ? "审批决策"
                      : tab === "ledger"
                        ? "投入台账"
                        : "会后复盘"}
            </strong>
          </div>
          <div className="headerActions">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option>评估员</option>
              <option>申请人</option>
              <option>审批人</option>
            </select>
            <button className="iconBtn">?</button>
            <button className="userBtn">评</button>
          </div>
        </header>
        <div className="content">
          {notice && (
            <div className="notice">
              {notice}
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {tab === "overview" && (
            <Overview
              apps={apps}
              onDemo={demo}
              onCreate={create}
              onOpen={open}
            />
          )}{" "}
          {tab === "extract" && (
            <Extract
              selected={selected}
              onCreated={(a) => {
                setSelected(a);
                load();
              }}
              onDemo={demo}
            />
          )}{" "}
          {tab === "review" && (
            <Review
              selected={selected}
              onRefresh={() =>
                selected &&
                api("/api/applications/" + selected.id).then(setSelected)
              }
              onSubmit={() => {
                setTab("approval");
              }}
            />
          )}{" "}
          {tab === "approval" && (
            <Approval
              selected={selected}
              onDone={() => {
                load();
                setTab("ledger");
              }}
            />
          )}{" "}
          {tab === "ledger" && <Ledger />}{" "}
          {tab === "post" && <Post selected={selected} />}
        </div>
      </main>
    </div>
  );
}

function Overview({ apps, onDemo, onCreate, onOpen }: any) {
  const pending = apps.filter(
    (a: any) => a.status === "PENDING_APPROVAL",
  ).length;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">2026 · 资源支持决策</p>
          <h1>
            让每一笔投入
            <br />
            <em>都有据可依</em>
          </h1>
          <p className="heroText">
            从申请识别到会后复盘，审批智评将材料、评分、预算与结果串成一条可追踪的决策链。
          </p>
          <div className="heroActions">
            <button className="primary" onClick={onCreate}>
              ＋ 新建申请
            </button>
            <button className="secondary" onClick={onDemo}>
              载入演示案例
            </button>
          </div>
        </div>
        <div className="heroViz">
          <div className="ring">
            <b>95</b>
            <span>满分</span>
          </div>
          <div className="vizLine">
            <span>医学价值</span>
            <i style={{ width: "80%" }} />
            <b>30</b>
          </div>
          <div className="vizLine">
            <span>战略价值</span>
            <i style={{ width: "54%" }} />
            <b>20</b>
          </div>
          <div className="vizLine">
            <span>商业价值</span>
            <i style={{ width: "70%" }} />
            <b>35</b>
          </div>
        </div>
      </section>
      <section className="metrics">
        <Metric
          label="待确认申请"
          value={
            apps.filter((a: any) =>
              ["REVIEWING", "EXTRACTED"].includes(a.status),
            ).length
          }
          hint="需要评估员处理"
          tone="amber"
        />
        <Metric
          label="待审批"
          value={pending}
          hint="等待审批人决策"
          tone="blue"
        />
        <Metric
          label="本月已支持"
          value="¥ 18.6万"
          hint="较上月 +12.4%"
          tone="green"
        />
        <Metric
          label="平均完整度"
          value="76%"
          hint="基于近30日申请"
          tone="purple"
        />
      </section>
      <section className="sectionHead">
        <div>
          <span className="eyebrow">Recent applications</span>
          <h2>近期申请</h2>
        </div>
        <button className="textBtn" onClick={() => {}}>
          查看全部 →
        </button>
      </section>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>项目</th>
              <th>医院 / KOL</th>
              <th>申请人</th>
              <th>申请金额</th>
              <th>评估状态</th>
              <th>更新时间</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {apps.slice(0, 6).map((a: any) => (
              <tr key={a.id} onClick={() => onOpen(a)}>
                <td>
                  <b>{a.projectName || "未命名项目"}</b>
                  <small>{a.applicationNo}</small>
                </td>
                <td>
                  {a.hospital || "—"}
                  <small>{a.kol || "KOL待补充"}</small>
                </td>
                <td>{a.applicant || "—"}</td>
                <td>
                  {a.requestedAmount
                    ? `¥ ${Number(a.requestedAmount).toFixed(1)}万`
                    : "未填写"}
                </td>
                <td>
                  <Status status={a.status} />
                </td>
                <td>
                  {a.updatedAt
                    ? new Date(a.updatedAt).toLocaleDateString("zh-CN")
                    : "—"}
                </td>
                <td>›</td>
              </tr>
            ))}
            {!apps.length && (
              <tr>
                <td colSpan={7}>
                  <div className="empty">
                    暂无申请，先载入江苏案例或新建一条申请
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
function Metric({ label, value, hint, tone }: any) {
  return (
    <div className="metric">
      <div className={"metricIcon " + tone}>◈</div>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{hint}</span>
      </div>
    </div>
  );
}
function Status({ status }: any) {
  const map: any = {
    REVIEWING: ["待确认", "amber"],
    EXTRACTED: ["已提取", "blue"],
    PENDING_APPROVAL: ["待审批", "purple"],
    APPROVED: ["已通过", "green"],
    REJECTED: ["已驳回", "red"],
    DRAFT: ["草稿", "gray"],
  };
  const [t, c] = map[status] || ["处理中", "gray"];
  return (
    <span className={"status " + c}>
      <i /> {t}
    </span>
  );
}

function Extract({ selected, onCreated, onDemo }: any) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();
  const [fields, setFields] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (selected) {
      const f: any = {};
      (selected.fields || []).forEach(
        (x: any) => (f[x.key] = x.confirmedValue || x.sourceValue),
      );
      setFields(f);
    }
  }, [selected]);
  const run = async () => {
    if (!selected) {
      onDemo();
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("application_id", selected.id);
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 180000);
        try {
          const result = await api(
            "/api/applications/" + selected.id + "/ocr-service",
            { method: "POST", body: form, signal: controller.signal },
          );
          const next: any = {};
          Object.entries(result.fields || {}).forEach(([key, value]: any) => {
            next[key] = value?.value ?? "";
          });
          setFields((old: any) => ({ ...old, ...next }));
        } finally {
          window.clearTimeout(timer);
        }
      } else if (text.trim()) {
        await api("/api/applications/" + selected.id + "/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, fields }),
        });
      } else {
        throw new Error("请先选择图片或粘贴申请文本");
      }
      onCreated(await api("/api/applications/" + selected.id));
    } catch (e: any) {
      setError(
        e.name === "AbortError"
          ? "识别超时（超过 3 分钟），请检查 OCR 服务状态后重试"
          : e.message || "识别失败",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="pageIntro">
        <div>
          <span className="eyebrow">Step 01 / 06</span>
          <h1>申请识别</h1>
          <p>上传截图或粘贴申请文本，系统将提取字段并标记需要确认的内容。</p>
        </div>
        <button className="secondary" onClick={onDemo}>
          载入演示案例
        </button>
      </div>
      <div className="extractGrid">
        <div className="uploadCard">
          <div className="uploadIcon">↑</div>
          <h3>拖放截图或点击上传</h3>
          <p>支持 PNG、JPG、PDF，单个文件不超过 10MB</p>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => {
              const next = e.target.files?.[0];
              setFile(next);
              setText(next?.name || "");
            }}
          />
          <div className="or">或粘贴申请文本</div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) setFile(undefined);
            }}
            placeholder="将会议申请内容粘贴至此..."
          />
          <button className="primary wide" onClick={run} disabled={busy}>
            {busy ? "识别中…" : "开始识别 →"}
          </button>
          {error && (
            <div
              className="notice"
              style={{ marginTop: 12, textAlign: "left" }}
            >
              {error}
            </div>
          )}
        </div>
        <div className="fieldCard">
          <div className="cardHead">
            <div>
              <span className="eyebrow">Extracted fields</span>
              <h3>识别字段</h3>
            </div>
            <span className="confidence">PaddleOCR + DeepSeek</span>
          </div>
          <div className="fieldGrid">
            {[
              ["region", "区域"],
              ["district", "地区"],
              ["applicant", "申请人"],
              ["hospital", "医院 / 会议单位"],
              ["kol", "KOL"],
              ["projectName", "项目名称"],
              ["meetingDate", "会议日期"],
              ["requestedAmount", "申请金额（万元）"],
              ["background", "合作背景"],
              ["benefits", "会议权益"],
              ["currentSales", "当前销量"],
              ["targetSales", "目标销量"],
            ].map(([k, l]) => (
              <label key={k}>
                <span>{l}</span>
                <input
                  className={
                    ["kol", "meetingDate"].includes(k) && fields[k]
                      ? "warn"
                      : ""
                  }
                  value={fields[k] || ""}
                  onChange={(e) =>
                    setFields({ ...fields, [k]: e.target.value })
                  }
                  placeholder="待识别"
                />
              </label>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Review({ selected, onRefresh, onSubmit }: any) {
  const [scores, setScores] = useState<any>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const s: any = {};
    (selected?.scores || []).forEach((x: any) => {
      const matched = options[x.key as ScoreKey]?.find(
        (option) => option.label === x.option,
      );
      s[x.key] = { ...x, score: matched?.score, confirmed: Boolean(matched) };
    });
    setScores(s);
  }, [selected]);
  if (!selected) return <EmptyState title="请选择一条申请" />;
  const fieldValue = (key: string, fallback = "待确认") =>
    selected[key] ??
    selected.fields?.find((x: any) => x.key === key)?.confirmedValue ??
    selected.fields?.find((x: any) => x.key === key)?.sourceValue ??
    fallback;
  const requested = Number(fieldValue("requestedAmount", "")) || undefined;
  const liveEvaluation = evaluate(scores, requested);
  const total = liveEvaluation.rawScore;
  const missing = liveEvaluation.missing.length;
  const save = async () => {
    setSaving(true);
    await Promise.all(
      (Object.entries(scores) as [string, any][]).map(([key, s]) =>
        api("/api/applications/" + selected.id + "/fields", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { [key]: s.option || "" } }),
        }),
      ),
    );
    await api("/api/applications/" + selected.id + "/score/recalculate", {
      method: "POST",
    });
    await onRefresh();
    setSaving(false);
  };
  const riskText =
    liveEvaluation.missing
      .map((key: string) => labels[key] || key)
      .join("、") || "暂无待确认项";
  return (
    <>
      <div className="pageIntro">
        <div>
          <span className="eyebrow">
            Step 02 / 06 · {selected.applicationNo}
          </span>
          <h1>评分确认</h1>
          <p>
            {fieldValue("projectName")} · {fieldValue("hospital")}
          </p>
        </div>
        <div className="introActions">
          <button className="secondary" onClick={save}>
            {saving ? "保存中…" : "保存评分"}
          </button>
          <button className="primary" onClick={onSubmit}>
            提交审批 →
          </button>
        </div>
      </div>
      <div className="scoreSummary">
        <div>
          <small>已确认得分</small>
          <strong>
            {total}
            <i>/95</i>
          </strong>
          <span>百分制 {liveEvaluation.percentile} 分</span>
        </div>
        <div>
          <small>待确认项目</small>
          <strong className="amberText">{missing}</strong>
          <span>资料完整度 {liveEvaluation.completeness}%</span>
        </div>
        <div>
          <small>评分档位额度</small>
          <strong>{liveEvaluation.recommendedRange}</strong>
          <span>
            {requested && liveEvaluation.defaultAmount >= requested
              ? `受申请金额约束，实际建议 ¥${liveEvaluation.defaultAmount} 万`
              : `实际建议 ¥${liveEvaluation.defaultAmount} 万`}
          </span>
        </div>
        <div className="riskBox">
          <b>{missing ? "⚠ 需要补充资料" : "✓ 资料已完整"}</b>
          <span>
            {missing
              ? `${riskText}确认后，评分区间预计 ${liveEvaluation.minPossible}-${liveEvaluation.maxPossible} 分`
              : "当前十项评分均已确认"}
          </span>
        </div>
      </div>
      <div className="scoreLayout">
        <div className="scoreCard">
          <div className="cardHead">
            <div>
              <span className="eyebrow">Rule engine · v2026.1</span>
              <h3>评分明细</h3>
            </div>
            <span className="legend">
              <i className="dot greenDot" />
              已确认 <i className="dot amberDot" />
              待确认
            </span>
          </div>
          <div className="scoreRows">
            {(Object.keys(labels) as ScoreKey[]).map((key) => {
              const s = scores[key] || {};
              const matched = options[key].find((x) => x.label === s.option);
              const confirmed = Boolean(matched);
              return (
                <div
                  className={"scoreRow " + (!confirmed ? "pending" : "")}
                  key={key}
                >
                  <div className="scoreLabel">
                    <b>{labels[key]}</b>
                    <small>{s.evidence || "等待材料确认"}</small>
                  </div>
                  <select
                    value={s.option || ""}
                    onChange={(e) => {
                      const option = e.target.value;
                      const matched = options[key].find(
                        (x) => x.label === option,
                      );
                      setScores((current: any) => ({
                        ...current,
                        [key]: {
                          ...current[key],
                          key,
                          option,
                          score: matched?.score,
                          confirmed: Boolean(matched),
                        },
                      }));
                    }}
                  >
                    <option value="">待确认</option>
                    {options[key].map((x) => (
                      <option key={x.label}>{x.label}</option>
                    ))}
                  </select>
                  <strong>
                    {confirmed ? matched!.score : "—"}
                    <i>/{Math.max(...options[key].map((x) => x.score))}</i>
                  </strong>
                  <span className={"check " + (confirmed ? "ok" : "wait")}>
                    {confirmed ? "✓" : "!"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="sidePanel">
          <h3>项目概览</h3>
          <dl>
            <dt>区域 / 地区</dt>
            <dd>
              {fieldValue("region")} · {fieldValue("district")}
            </dd>
            <dt>申请人</dt>
            <dd>{fieldValue("applicant")}</dd>
            <dt>会议日期</dt>
            <dd>
              {fieldValue("meetingDate") !== "待确认"
                ? new Date(fieldValue("meetingDate")).toLocaleDateString(
                    "zh-CN",
                  )
                : "待确认"}
            </dd>
            <dt>申请金额</dt>
            <dd className="money">¥ {fieldValue("requestedAmount", "—")} 万</dd>
          </dl>
          <div className="note">
            <b>评价初稿</b>
            <p>
              {selected.evaluations?.[0]?.narrative ||
                "保存评分后生成自动评价。"}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
function Approval({ selected, onDone }: any) {
  const [decision, setDecision] = useState("按建议金额支持");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const evaluation = selected?.evaluations?.[0] || {};
  const recommended = Number(evaluation.defaultAmount ?? 0);
  const requested = Number(selected?.requestedAmount ?? 0);
  useEffect(() => {
    if (selected) setAmount(String(recommended));
  }, [selected?.id, recommended]);
  if (!selected) return <EmptyState title="请先从评分确认进入审批" />;
  const changeDecision = (value: string) => {
    setDecision(value);
    if (value === "按建议金额支持") setAmount(String(recommended));
    else if (value === "同意申请金额") setAmount(String(requested));
    else if (value === "暂不支持") setAmount("0");
  };
  const missingKeys: string[] = evaluation.missingKeys || [];
  const submit = async () => {
    await api("/api/applications/" + selected.id + "/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-role": "APPROVER" },
      body: JSON.stringify({
        decision,
        approvedAmount: Number(amount),
        reason,
      }),
    });
    onDone();
  };
  return (
    <>
      <div className="pageIntro">
        <div>
          <span className="eyebrow">Step 03 / 06 · Decision</span>
          <h1>审批决策</h1>
          <p>确认投入金额与审批结论，系统将自动写入投入台账。</p>
        </div>
      </div>
      <div className="decisionGrid">
        <div className="decisionMain">
          <div className="decisionHero">
            <span className="eyebrow">Recommendation</span>
            <h2>
              实际建议支持 <em>¥ {recommended} 万元</em>
            </h2>
            <p>
              评分档位额度 {evaluation.recommendedRange || "待确认"}；申请金额
              {requested} 万元，实际建议按申请金额和预算封顶。
            </p>
          </div>
          <label className="formLabel">
            审批结论
            <select
              value={decision}
              onChange={(e) => changeDecision(e.target.value)}
            >
              <option>按建议金额支持</option>
              <option>同意申请金额</option>
              <option>补充资料后审批</option>
              <option>暂不支持</option>
              <option>CUSTOM</option>
            </select>
          </label>
          <label className="formLabel">
            审批金额（万元）
            <input
              type="number"
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="formLabel">
            调整理由（金额非建议值时必填）
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="如：战略医院特殊保护、竞品进入风险…"
            />
          </label>
          <button className="primary wide" onClick={submit}>
            确认审批并写入台账
          </button>
        </div>
        <div className="sidePanel">
          <h3>风险与预算</h3>
          <div className="budget">
            <span>区域年度预算使用率</span>
            <b>62%</b>
            <i>
              <em style={{ width: "62%" }} />
            </i>
            <small>剩余预算 ¥ 38 万 · 本申请建议 ¥ {recommended} 万</small>
          </div>
          <div className="riskList">
            {missingKeys.length ? (
              missingKeys.map((key) => (
                <p key={key}>⚠ {labels[key] || key}尚未确认</p>
              ))
            ) : (
              <p>✓ 当前评分资料已完整</p>
            )}
            <p>✓ 申请金额已录入：¥ {requested} 万</p>
          </div>
        </div>
      </div>
    </>
  );
}
function Ledger() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    api("/api/ledger").then(setRows);
  }, []);
  return (
    <>
      <div className="pageIntro">
        <div>
          <span className="eyebrow">Ledger / 2026</span>
          <h1>投入台账</h1>
          <p>申请、建议、审批与实际投入分列记录，支持多维度归集。</p>
        </div>
        <button className="secondary">导出台账 ↓</button>
      </div>
      <div className="metrics">
        <Metric
          label="年度预算"
          value="¥ 100万"
          hint="2026 市场部"
          tone="blue"
        />
        <Metric
          label="已审批"
          value={`¥ ${rows.reduce((n, r) => n + (r.approvedAmount || 0), 0).toFixed(1)}万`}
          hint={`${rows.length} 个项目`}
          tone="green"
        />
        <Metric
          label="实际投入"
          value="¥ 0万"
          hint="待会后回写"
          tone="purple"
        />
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>项目 / 申请编号</th>
              <th>区域</th>
              <th>医院</th>
              <th>申请金额</th>
              <th>建议金额</th>
              <th>审批金额</th>
              <th>实际投入</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.application?.projectName}</b>
                  <small>{r.application?.applicationNo}</small>
                </td>
                <td>{r.region}</td>
                <td>{r.hospital}</td>
                <td>¥ {r.requestedAmount || 0}万</td>
                <td>¥ {r.recommendedAmount || 0}万</td>
                <td className="money">¥ {r.approvedAmount || 0}万</td>
                <td>待回写</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">审批通过的项目会自动出现在这里</div>
        )}
      </div>
    </>
  );
}
function Post({ selected }: any) {
  const [done, setDone] = useState(false);
  return (
    <>
      <div className="pageIntro">
        <div>
          <span className="eyebrow">Step 06 / 06 · Review</span>
          <h1>会后复盘</h1>
          <p>记录实际投入与业务结果，让下一次决策有历史依据。</p>
        </div>
      </div>
      <div className="reviewForm">
        <div className="reviewBanner">
          <b>{selected?.projectName || "选择一个已审批项目"}</b>
          <span>会后 30 日内完成复盘</span>
        </div>
        <div className="formGrid">
          <label className="formLabel">
            目标月均销量（万元）
            <input placeholder="例如 20" />
          </label>
          <label className="formLabel">
            实际月均销量（万元）
            <input placeholder="例如 24" />
          </label>
          <label className="formLabel">
            实际投入（万元）
            <input placeholder="例如 1.5" />
          </label>
          <label className="formLabel">
            新增科室 / 医院
            <input placeholder="例如 胸外科、呼吸科" />
          </label>
        </div>
        <label className="formLabel">
          复盘结论
          <textarea placeholder="记录转化效果、客户反馈与下一步建议…" />
        </label>
        <button className="primary" onClick={() => setDone(true)}>
          {done ? "已保存 ✓" : "保存复盘"}
        </button>
      </div>
    </>
  );
}
function EmptyState({ title }: any) {
  return (
    <div className="emptyState">
      <div>◌</div>
      <h2>{title}</h2>
      <p>请从总览工作台选择或载入一个申请。</p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
