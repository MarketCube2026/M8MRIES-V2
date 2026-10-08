import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { applicationFields, fieldLabels } from '../shared/fields';
import { applicationDate, applicationStatuses, displayAmount, emptyApplicationFilters,
  filterApplications, type ApplicationFilters } from './application-filters';

export function ApplicationList({ onBack, onNavigate }: {
  onBack: () => void; onNavigate: (application: any, tab: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState({ ...emptyApplicationFilters });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailError, setDetailError] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialogElement = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api('/api/applications', { signal: controller.signal })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('申请列表返回格式异常，请重试');
        if (!controller.signal.aborted) setRows(data);
      }).catch(e => { if (!controller.signal.aborted) setError(e.message || '加载申请失败'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (!detailId) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailError('');
    closeButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    api('/api/applications/' + encodeURIComponent(detailId), { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDetail(data); })
      .catch(e => { if (!controller.signal.aborted) setDetailError(e.message || '加载详情失败'); });
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailId(null);
      if (e.key === 'Tab') {
        const buttons = dialogElement.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', escape);
    return () => {
      controller.abort();
      window.removeEventListener('keydown', escape);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [detailId, reload]);

  const regions = useMemo(() => Array.from(new Set(rows.map(row => applicationFields(row).region)
    .filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN')), [rows]);
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const visible = useMemo(() => filterApplications(rows, filters), [rows, filters]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages);
  const paged = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const change = (key: keyof ApplicationFilters, value: string) => {
    setFilters(old => ({ ...old, [key]: value }));
    setPage(1);
  };
  const showDetail = (id: string) => {
    previousFocus.current = document.activeElement as HTMLElement;
    setDetail(null);
    setDetailError('');
    setDetailId(id);
  };
  const fields = detail ? applicationFields(detail) : {};
  const latestApproval = detail?.approvals?.slice().sort((a: any, b: any) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return <>
    <div className="pageIntro applicationIntro">
      <div><h1>全部申请</h1><p>共 {rows.length} 条 · 筛选结果 {visible.length} 条</p></div>
      <div className="introActions">
        <button className="secondary" onClick={onBack}>返回总览</button>
        <button className="secondary" disabled={loading} onClick={() => setReload(value => value + 1)}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
    </div>
    <div className="applicationFilters">
      <label className="applicationSearch">搜索
        <input type="search" value={filters.query} placeholder="项目名称 / ID / 医院 / 申请人 / KOL"
          onChange={e => change('query', e.target.value)} />
      </label>
      <label>评估状态<select value={filters.status} onChange={e => change('status', e.target.value)}>
        <option value="">全部状态</option>
        {Object.entries(applicationStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>区域<select value={filters.region} onChange={e => change('region', e.target.value)}>
        <option value="">全部区域</option>
        {regions.map(region => <option key={region} value={region}>{region}</option>)}
      </select></label>
      <label>更新开始日期<input type="date" value={filters.from} max={filters.to || undefined}
        onChange={e => change('from', e.target.value)} /></label>
      <label>更新结束日期<input type="date" value={filters.to} min={filters.from || undefined}
        onChange={e => change('to', e.target.value)} /></label>
      <button className="secondary" onClick={() => { setFilters({ ...emptyApplicationFilters }); setPage(1); }}>重置筛选</button>
    </div>
    {invalidDates && <div className="notice" role="alert">开始日期不能晚于结束日期</div>}
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="tableWrap">
      <table className="applicationTable" aria-label="全部申请">
        <thead><tr><th>项目 / 编号</th><th>医院 / KOL</th><th>区域 / 申请人</th><th>申请金额</th><th>评估状态</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody>{!loading && !error && !invalidDates && paged.map(row => {
          const values = applicationFields(row);
          return <tr key={row.id} onClick={() => showDetail(row.id)}>
            <td><b>{values.projectName || '未命名项目'}</b><small>{row.projectId || '项目ID待生成'} · {row.applicationNo}</small></td>
            <td>{values.hospital || '未填写'}<small>{values.kol || 'KOL待补充'}</small></td>
            <td>{values.region || '未填写'}<small>{values.applicant || '申请人待补充'}</small></td>
            <td>{displayAmount(values.requestedAmount)}</td>
            <td>{applicationStatuses[row.status] || row.status || '未知'}</td>
            <td>{applicationDate(row.updatedAt) || '未记录'}</td>
            <td><button className="textBtn" aria-label={'查看详情：' + (values.projectName || row.applicationNo || row.id)}
              onClick={e => { e.stopPropagation(); showDetail(row.id); }}>查看详情</button></td>
          </tr>;
        })}</tbody>
      </table>
      {loading && <div className="empty" role="status">正在加载申请…</div>}
      {!loading && !error && !invalidDates && !visible.length &&
        <div className="empty">{rows.length ? '暂无匹配的申请' : '暂无申请'}</div>}
    </div>
    <div className="applicationPagination">
      <label>每页 <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
        {[20, 50, 100].map(size => <option key={size} value={size}>{size} 条</option>)}
      </select></label>
      <span>第 {currentPage} / {pages} 页</span>
      <button className="secondary" disabled={loading || currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一页</button>
      <button className="secondary" disabled={loading || currentPage >= pages} onClick={() => setPage(currentPage + 1)}>下一页</button>
    </div>
    {detailId && <div className="modalBackdrop" onClick={() => setDetailId(null)}>
      <div ref={dialogElement} className="detailModal applicationDetail" role="dialog" aria-modal="true" aria-labelledby="applicationDetailTitle"
        onClick={e => e.stopPropagation()}>
        <div className="cardHead">
          <h2 id="applicationDetailTitle">申请详情</h2>
          <button ref={closeButton} className="secondary" onClick={() => setDetailId(null)}>关闭</button>
        </div>
        {!detail && !detailError && <p role="status">正在加载详情…</p>}
        {detailError && <div role="alert" className="notice">{detailError}
          <button onClick={() => setReload(value => value + 1)}>重试</button>
        </div>}
        {detail && <>
          <dl className="detailList">
            <dt>项目ID</dt><dd>{detail.projectId || '未记录'}</dd>
            <dt>申请编号</dt><dd>{detail.applicationNo || '未记录'}</dd>
            <dt>评估状态</dt><dd>{applicationStatuses[detail.status] || detail.status}</dd>
            <dt>更新时间</dt><dd>{applicationDate(detail.updatedAt) || '未记录'}</dd>
            {Object.entries(fieldLabels).map(([key, label]) => <Fragment key={key}>
              <dt>{label}</dt><dd>{key === 'requestedAmount' ? displayAmount(fields[key]) : fields[key] || '未填写'}</dd>
            </Fragment>)}
            <dt>历史评分</dt><dd>{detail.evaluations?.[0]?.rawScore ?? '未评分'}</dd>
            <dt>建议支持金额</dt><dd>{displayAmount(detail.evaluations?.[0]?.defaultAmount)}</dd>
            <dt>审批金额</dt><dd>{displayAmount(latestApproval?.approvedAmount)}</dd>
            <dt>审批时间</dt><dd>{applicationDate(latestApproval?.createdAt) || '未审批'}</dd>
            <dt>备注</dt><dd>{latestApproval?.note ?? latestApproval?.reason ?? '未填写'}</dd>
            <dt>复盘状态</dt><dd>{detail.reviews?.length ? '已复盘' : '未复盘'}</dd>
          </dl>
          <div className="modalActions">
            {detail.sourceSystem === 'V2' && ['DRAFT', 'EXTRACTED', 'REVIEWING'].includes(detail.status) &&
              <button className="secondary" onClick={() => onNavigate(detail, 'extract')}>申请识别</button>}
            <button className="primary" onClick={() => onNavigate(detail, 'review')}>查看评分</button>
          </div>
        </>}
      </div>
    </div>}
  </>;
}
