import React, { useEffect, useMemo, useState } from "react";
import "./evaluation-editor";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./evaluation.css";
import { evaluate, options, ScoreKey } from "./rules";
import { api, auth, localMode, ocrApi } from "./api";
import { AuthGate } from "./auth";
import { draft, fieldLabels } from "../shared/fields";

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

async function retryLocal<T>(operation: () => Promise<T>): Promise<T> {
  const attempts = localMode ? 8 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
    }
  }
  throw lastError;
}

function App() {
  const [tab, setTab] = useState("overview");
  const [apps, setApps] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>();
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState("正在验证权限");
  const load = () => api("/api/applications").then(setApps).catch((e) => setNotice(e.message));
  useEffect(() => {
    let active = true;
    void Promise.all([
      retryLocal(() => api("/api/applications")),
      retryLocal(() => api("/api/me")),
    ]).then(([applications, user]) => {
      if (!active) return;
      setApps(applications);
      setRole(({ APPLICANT: "申请人", EVALUATOR: "评估员", APPROVER: "审批人" } as any)[user.role] || "权限未知");
      setNotice("");
    }).catch((error) => {
      if (!active) return;
      setRole("权限验证失败");
      setNotice(error.message || "服务暂不可用，请联系管理员");
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const showError = (event: Event) => setNotice((event as CustomEvent<string>).detail);
    window.addEventListener("api-error", showError);
    return () => window.removeEventListener("api-error", showError);
  }, []);
  const demo = async () => {
    if (!localMode) {
      setNotice("生产模式不载入演示数据，请新建申请。");
      return;
    }
    const a = await api("/api/applications/demo", { method: "POST" });
    setSelected(a);
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
            ["bi", "BI 数据", "◉"],
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
          <div className="avatar">{role === "审批人" ? "审" : role === "申请人" ? "申" : "评"}</div>
          <div>
            <b>{role === "审批人" ? "审批负责人" : role === "申请人" ? "业务申请人" : "市场部评估员"}</b>
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
                        : tab === "bi"
                          ? "BI 数据"
                          : "会后复盘"}
            </strong>
          </div>
          <div className="headerActions">
            <span>{role}</span>
            <button onClick={()=>auth?.auth.signOut()}>退出登录</button>
            <button className="iconBtn">?</button>
            <button className="userBtn">{role === "审批人" ? "审" : role === "申请人" ? "申" : "评"}</button>
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
              onCreated={(a: any) => {
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
              onSubmit={async () => {
                await api("/api/applications/" + selected.id + "/submit", { method: "POST" });
                setSelected(await api("/api/applications/" + selected.id));
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
          {tab === "bi" && <BI selected={selected} />} {" "}
          {tab === "post" && <Post selected={selected} applications={apps} onSelect={setSelected} onSaved={async () => {
            await load();
            if (selected?.id) setSelected(await api("/api/applications/" + selected.id));
          }} />}
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
            <b>100</b>
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
            <b>40</b>
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
                  <small>{a.projectId || "项目ID待生成"} · {a.applicationNo}</small>
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
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File>();
  const [fields, setFields] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (selected) {
      const f: any = {};
      (selected.fields || []).forEach(
        (x: any) => (f[x.key] = x.confirmedValue ?? x.sourceValue ?? ""),
      );
      setFields(f);
    }
  }, [selected]);
  const editableFields = () => Object.fromEntries(Object.entries(fields).filter(([key]) => key in fieldLabels));
  const run = async () => {
    if (!selected) {
      onDemo();
      return;
    }
    setError("");
    setBusy(true);
    try {
      if (manual) {
        await api("/api/applications/" + selected.id + "/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "手动录入", fields: editableFields() }) });
      } else if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("application_id", selected.id);
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 300000);
        try {
          const result = await ocrApi(
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
          <div className="uploadIcon">↑</div><div className="extractMode"><button className={!manual ? "primary" : "secondary"} onClick={() => setManual(false)}>自动识别</button><button className={manual ? "primary" : "secondary"} onClick={() => setManual(true)}>手动输入</button></div>
          <h3>{manual ? "手动填写申请信息" : "拖放截图或点击上传"}</h3>
          <p>{manual ? "直接填写右侧字段，保存后进入评分确认" : "支持 PNG、JPG、PDF，单个文件不超过 10MB"}</p>
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
            {busy ? "处理中…" : manual ? "保存手动输入 →" : "开始识别 →"}
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
              ["benefits", "参会权益"],
              ["currentSales", "当前销量"],
              ["targetSales", "目标销量"],
              ["inHospitalSubmissionRatio", "院内送检占比"],
              ["growthPoints", "增长点"],
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
                  placeholder="待识别，可手动填写"
                />
              </label>
            ))}
          </div>
          <button className="secondary" disabled={busy || !selected} onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api(`/api/applications/${selected.id}/fields`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fields: editableFields() }),
              });
              onCreated(await api(`/api/applications/${selected.id}`));
            } catch (e: any) { setError(e.message || "保存字段失败"); }
            finally { setBusy(false); }
          }}>保存字段修改</button>
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
      s[x.key] = selected.sourceSystem && selected.sourceSystem !== "V2"
        ? { ...x } : { ...x, score: matched?.score, confirmed: Boolean(matched) };
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
  const historical = selected.sourceSystem && selected.sourceSystem !== "V2";
  const historicalEvaluation = selected.evaluations?.[0];
  const liveEvaluation = historical && historicalEvaluation
    ? { ...historicalEvaluation, missing: historicalEvaluation.missingKeys || [] }
    : evaluate(scores, requested);
  const total = liveEvaluation.rawScore;
  const missing = liveEvaluation.missing.length;
  const save = async () => {
    setSaving(true);
    try {
    await api("/api/applications/" + selected.id + "/fields", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: Object.fromEntries(
          (Object.entries(scores) as [string, any][]).map(([key, score]) => [key, score.option || ""]),
        ),
      }),
    });
    await api("/api/applications/" + selected.id + "/score/recalculate", {
      method: "POST",
    });
    await onRefresh();
    } finally { setSaving(false); }
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
            Step 02 / 06 · {selected.projectId || "项目ID待生成"}
          </span>
          <h1>评分确认</h1>
          <p>
            {fieldValue("projectName")} · {fieldValue("hospital")}
          </p>
        </div>
        <div className="introActions">
          <button className="secondary" onClick={save} disabled={historical || saving}>
            {saving ? "保存中…" : "保存评分"}
          </button>
          <button className="primary" disabled={historical || saving} onClick={async () => { await save(); await onSubmit(); }}>
            提交审批 →
          </button>
        </div>
      </div>
      <div className="scoreSummary">
        <div>
          <small>已确认得分</small>
          <strong>
            {total}
            <i>{historical ? "（历史原分）" : "/100"}</i>
          </strong>
          <span>{historical ? "历史评分原样保留，未换算百分制" : `百分制 ${liveEvaluation.percentile} 分`}</span>
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
                    disabled={historical}
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
                    {historical && s.option && !matched && <option value={s.option}>{s.option}</option>}
                    {options[key].map((x) => (
                      <option key={x.label}>{x.label}</option>
                    ))}
                  </select>
                  <strong>
                    {historical ? s.score ?? "—" : confirmed ? matched!.score : "—"}
                    <i>{historical ? "（历史）" : "/" + Math.max(...options[key].map((x) => x.score))}</i>
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
          <Narrative key={selected.id} selected={selected} evaluation={liveEvaluation} historical={historical} />
        </div>
      </div>
    </>
  );
}
function Approval({ selected, onDone }: any) {
  const [decision, setDecision] = useState("按建议金额支持");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        approvedAmount: Number(amount),
        reason: note,
        note,
      }),
    });
    onDone();
  };
  return (
    <>
      <div className="pageIntro">
        <div>
          <span className="eyebrow">Step 03 / 06 · {selected.projectId || "项目ID待生成"} · Decision</span>
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
            备注
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="填写审批说明或其他补充信息"
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
            <b>待接入</b>
            <i>
              <em style={{ width: "0%" }} />
            </i>
            <small>剩余预算尚未接入 · 本申请建议 ¥ {recommended} 万</small>
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
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const load = () => api("/api/ledger").then(setRows);
  useEffect(() => { load(); }, []);
  const visible = rows.filter((r) => `${r.application?.projectName || ""} ${r.application?.applicationNo || ""} ${r.region || ""} ${r.hospital || ""}`.toLowerCase().includes(query.toLowerCase()));
  const save = async () => {
    const updated = await api(`/api/ledger/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvedAmount: Number(editing.approvedAmount), actualAmount: editing.actualAmount === "" ? null : Number(editing.actualAmount), note: editing.note ?? "" }) });
    setRows((items) => items.map((item) => item.id === updated.id ? updated : item)); setSelected(updated); setEditing(null);
  };
  const remove = async (row: any) => {
    if (!window.confirm("确定删除这条投入台账记录吗？")) return;
    await api(`/api/ledger/${row.id}`, { method: "DELETE" });
    setRows((items) => items.filter((item) => item.id !== row.id)); setSelected(null);
  };
  return <>
    <div className="pageIntro"><div><span className="eyebrow">Ledger / 2026</span><h1>投入台账</h1><p>申请、建议、审批与实际投入分列记录，支持查看、修改、删除和检索。</p></div><div className="introActions"><input className="fieldSearch" placeholder="搜索项目、区域或医院" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="secondary">导出台账 ↓</button></div></div>
    <div className="metrics"><Metric label="年度预算" value="¥ 100万" hint="2026 市场部" tone="blue"/><Metric label="已审批" value={`¥ ${rows.reduce((n,r)=>n+(Number(r.approvedAmount)||0),0).toFixed(1)}万`} hint={`${rows.length} 个项目`} tone="green"/><Metric label="实际投入" value={`¥ ${rows.reduce((n,r)=>n+(Number(r.actualAmount)||0),0).toFixed(1)}万`} hint="会后投入累计" tone="purple"/></div>
    <div className="tableWrap"><table><thead><tr><th>项目 / 申请编号</th><th>区域</th><th>医院</th><th>申请金额</th><th>建议金额</th><th>审批金额</th><th>实际投入</th><th>操作</th></tr></thead><tbody>{visible.map((r)=><tr key={r.id} onClick={()=>setSelected(r)}><td><b>{r.application?.projectName||"未命名项目"}</b><small>{r.application?.projectId || "项目ID待生成"} · {r.application?.applicationNo||"-"}</small></td><td>{r.region||r.application?.region||"-"}</td><td>{r.hospital||r.application?.hospital||"-"}</td><td>¥ {r.requestedAmount||0}万</td><td>¥ {r.recommendedAmount||0}万</td><td className="money">¥ {r.approvedAmount||0}万</td><td>¥ {r.actualAmount||0}万</td><td><button className="textBtn" onClick={(e)=>{e.stopPropagation();setSelected(r)}}>查看</button></td></tr>)}</tbody></table>{!visible.length&&<div className="empty">{query?"没有匹配的台账记录":"审批通过的项目会自动出现在这里"}</div>}</div>
    {selected&&<div className="modalBackdrop" onClick={()=>setSelected(null)}><div className="detailModal" onClick={(e)=>e.stopPropagation()}><div className="cardHead"><div><span className="eyebrow">Ledger detail</span><h2>{selected.application?.projectName||"投入记录"}</h2><small>{selected.application?.projectId || "项目ID待生成"} · {selected.application?.applicationNo}</small></div><button className="iconBtn" onClick={()=>setSelected(null)}>×</button></div><dl className="detailList"><dt>区域 / 医院</dt><dd>{selected.region||selected.application?.region||"-"} / {selected.hospital||selected.application?.hospital||"-"}</dd><dt>KOL</dt><dd>{selected.kol||selected.application?.kol||"-"}</dd><dt>申请金额</dt><dd>¥ {selected.requestedAmount||0} 万</dd><dt>建议金额</dt><dd>¥ {selected.recommendedAmount||0} 万</dd><dt>审批金额</dt><dd>¥ {selected.approvedAmount||0} 万</dd><dt>实际投入</dt><dd>¥ {selected.actualAmount||0} 万</dd><dt>备注</dt><dd>{selected.note||"-"}</dd></dl><div className="modalActions"><button className="secondary" onClick={()=>{setEditing({...selected,actualAmount:selected.actualAmount??""});setSelected(null)}}>编辑</button><button className="dangerBtn" onClick={()=>remove(selected)}>删除</button></div></div></div>}
    {editing&&<div className="modalBackdrop"><div className="detailModal"><div className="cardHead"><h2>编辑投入台账</h2><button className="iconBtn" onClick={()=>setEditing(null)}>×</button></div><label className="formLabel">审批金额（万元）<input type="number" min="0" step="0.1" value={editing.approvedAmount??""} onChange={(e)=>setEditing({...editing,approvedAmount:e.target.value})}/></label><label className="formLabel">实际投入（万元）<input type="number" min="0" step="0.1" value={editing.actualAmount??""} onChange={(e)=>setEditing({...editing,actualAmount:e.target.value})}/></label><label className="formLabel">备注<textarea value={editing.note??""} onChange={(e)=>setEditing({...editing,note:e.target.value})}/></label><div className="modalActions"><button className="secondary" onClick={()=>setEditing(null)}>取消</button><button className="primary" onClick={save}>保存修改</button></div></div></div>}
  </>;
}
function BI({ selected }: any) {
  const BI_DASHBOARD_URL = "https://bi.geneseeq.com/dashboard?menuId=48";
  const [filters, setFilters] = useState({ hospital: selected?.hospital || "", department: selected?.department || "", expert: selected?.kol || "", startDate: "", endDate: "" });
  const [result, setResult] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setFilters((old) => ({ ...old, hospital: selected?.hospital || old.hospital, department: selected?.department || old.department, expert: selected?.kol || old.expert })); }, [selected]);
  useEffect(() => { setStatus({ configured: true }); }, []);
  const update = (key: string, value: string) => setFilters((old) => ({ ...old, [key]: value }));
  const query = async () => {
    window.location.assign(BI_DASHBOARD_URL);
  };
  return <>
    <div className="pageIntro"><div><span className="eyebrow">BI DATA / READ ONLY</span><h1>BI 数据</h1><p>查询医院进院、客户销量和历史资源投入，为审批决策提供业务依据。</p></div><span className={`status ${status?.configured ? "green" : "gray"}`}><i />{status?.configured ? "BI 已连接" : "BI 尚未配置"}</span></div>
    <div className="biFilters"><label>医院<input value={filters.hospital} onChange={(e) => update("hospital", e.target.value)} placeholder="医院名称" /></label><label>科室<input value={filters.department} onChange={(e) => update("department", e.target.value)} placeholder="科室名称" /></label><label>专家<input value={filters.expert} onChange={(e) => update("expert", e.target.value)} placeholder="专家姓名" /></label><label>开始日期<input type="date" value={filters.startDate} onChange={(e) => update("startDate", e.target.value)} /></label><label>结束日期<input type="date" value={filters.endDate} onChange={(e) => update("endDate", e.target.value)} /></label><button className="primary" onClick={query} disabled={busy}>{busy ? "查询中…" : "查询 BI 数据"}</button></div>
    {error && <div className="notice">{error}</div>}
    {!result && !error && <div className="emptyState"><div>◉</div><h2>{status?.configured ? "请输入条件查询" : "BI 尚未配置"}</h2><p>{status?.configured ? "选择医院、科室、专家或时间范围后开始查询。" : "请在服务端环境变量中配置 BI API 地址和凭证。"}</p></div>}
    {result && <><div className="metrics"><Metric label="进院状态" value={result.admissionStatus || "-"} hint={result.admissionDate || "BI 返回"} tone="green" /><Metric label="月均销量" value={result.monthlySales == null ? "-" : `${result.monthlySales} 万`} hint="BI 当前周期" tone="blue" /><Metric label="销量趋势" value={result.salesTrend || "-"} hint={result.trendPeriod || "BI 返回"} tone="purple" /><Metric label="历史资源投入" value={result.historicalSpend == null ? "-" : `¥ ${result.historicalSpend} 万`} hint="历史累计" tone="amber" /></div><div className="tableWrap"><table><thead><tr><th>专家</th><th>医院</th><th>科室</th><th>月均销量</th><th>销量趋势</th><th>进院状态</th></tr></thead><tbody>{customers.map((item, index) => <tr key={item.id || index}><td>{item.expert || item.kol || item.customer || "-"}</td><td>{item.hospital || "-"}</td><td>{item.department || item.product || "-"}</td><td>{item.monthlySales == null ? "-" : `${item.monthlySales} 万`}</td><td>{item.salesTrend || "-"}</td><td>{item.admissionStatus || "-"}</td></tr>)}</tbody></table>{!customers.length && <div className="empty">暂无客户明细</div>}</div></>}
  </>;
}
function approvalDateOf(application: any) {
  const timestamps = (application?.approvals || [])
    .map((approval: any) => new Date(approval.createdAt).getTime())
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)) : null;
}
function Post({ selected, applications = [], onSelect, onSaved }: any) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({targetSales:"",actualSales:"",actualSpend:"",coveredDepartments:"",conclusion:""});
  const dueApplications = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 1);
    return applications.filter((application: any) => {
      const approvalDate = approvalDateOf(application);
      return application.status === "APPROVED" && !application.reviews?.length && approvalDate && approvalDate <= cutoff;
    }).sort((a: any, b: any) => approvalDateOf(a)!.getTime() - approvalDateOf(b)!.getTime());
  }, [applications]);
  useEffect(()=>{setDone(false);setForm({targetSales:"",actualSales:"",actualSpend:"",coveredDepartments:"",conclusion:""});},[selected?.id]);
  const change = (key: keyof typeof form, value: string) => {setDone(false);setForm(old=>({...old,[key]:value}));};
  return (
    <>
      <div className="pageIntro">
        <div>
          <span className="eyebrow">Step 06 / 06 · Review</span>
          <h1>会后复盘</h1>
          <p>记录实际投入与业务结果，让下一次决策有历史依据。</p>
        </div>
      </div>
      <section className="sectionHead">
        <div><span className="eyebrow">Pending review</span><h2>待复盘项目</h2></div>
        <span className={`status ${dueApplications.length ? "amber" : "green"}`}><i />{dueApplications.length} 个待办</span>
      </section>
      <div className="tableWrap postQueue">
        <table>
          <thead><tr><th>项目</th><th>医院 / KOL</th><th>审批金额</th><th>审批时间</th><th>状态</th></tr></thead>
          <tbody>{dueApplications.map((application: any) => {
            const approval = application.approvals?.slice().sort((a: any,b: any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0];
            const approvalDate = approvalDateOf(application)!;
            return <tr key={application.id} onClick={()=>onSelect(application)}>
              <td><b>{application.projectName||"未命名项目"}</b><small>{application.projectId} · {application.applicationNo}</small></td>
              <td>{application.hospital||"-"}<small>{application.kol||"KOL待补充"}</small></td>
              <td className="money">¥ {approval?.approvedAmount??0} 万</td>
              <td>{approvalDate.toLocaleDateString("zh-CN")}</td>
              <td><span className="status amber"><i />待复盘</span></td>
            </tr>;
          })}</tbody>
        </table>
        {!dueApplications.length&&<div className="empty">暂无超过一个月且尚未完成复盘的项目</div>}
      </div>
      <div className="reviewForm">
        <div className="reviewBanner">
          <b>{selected?.projectName || "选择一个已审批项目"}</b>
          <span>会后 30 日内完成复盘</span>
        </div>
        <div className="formGrid">
          <label className="formLabel">
            目标月均销量（万元）
            <input value={form.targetSales} onChange={e=>change("targetSales",e.target.value)} type="number" min="0" placeholder="例如 20" />
          </label>
          <label className="formLabel">
            实际月均销量（万元）
            <input value={form.actualSales} onChange={e=>change("actualSales",e.target.value)} type="number" min="0" placeholder="例如 24" />
          </label>
          <label className="formLabel">
            实际投入（万元）
            <input value={form.actualSpend} onChange={e=>change("actualSpend",e.target.value)} type="number" min="0" placeholder="例如 1.5" />
          </label>
          <label className="formLabel">
            新增科室 / 医院
            <input value={form.coveredDepartments} onChange={e=>change("coveredDepartments",e.target.value)} placeholder="例如 胸外科、呼吸科" />
          </label>
        </div>
        <label className="formLabel">
          复盘结论
          <textarea value={form.conclusion} onChange={e=>change("conclusion",e.target.value)} placeholder="记录转化效果、客户反馈与下一步建议…" />
        </label>
        {error && <div className="notice">{error}</div>}
        <button className="primary" disabled={!selected} onClick={async () => {
          setError("");
          try {
            await api("/api/applications/"+selected.id+"/review",{method:"POST",headers:{"Content-Type":"application/json"},
              body:JSON.stringify({...form,targetSales:form.targetSales===""?null:Number(form.targetSales),actualSales:form.actualSales===""?null:Number(form.actualSales),actualSpend:form.actualSpend===""?null:Number(form.actualSpend)})});
            await onSaved?.();
            setDone(true);
          }catch(e:any){setError(e.message);}
        }}>
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
function Narrative({selected,evaluation,historical}:any) {
  const [manual,setManual]=useState(selected.narrativeOverride!=null);
  const [text,setText]=useState(selected.narrativeOverride || "");
  const [message,setMessage]=useState("");
  const value=historical ? selected.evaluations?.[0]?.narrative || "历史评价未提供" : manual ? text : draft(selected,evaluation);
  return <div className="note"><b>评价初稿</b>
    <textarea className="evaluationEditor" readOnly={historical} value={value} onChange={e=>{setManual(true);setText(e.target.value);setMessage("");}} />
    {!historical && <><button className="textBtn" onClick={async()=>{
      try{await api("/api/applications/"+selected.id+"/narrative",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({narrative:manual?text:null})});setMessage("已保存");}
      catch(e:any){setMessage(e.message);}
    }}>保存评价</button><button className="textBtn" onClick={()=>{setManual(false);setMessage("已恢复自动生成，请保存");}}>恢复自动生成</button></>}
    <small>{message}</small>
  </div>;
}
createRoot(document.getElementById("root")!).render(<AuthGate><App /></AuthGate>);
