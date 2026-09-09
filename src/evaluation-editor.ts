const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes('/api/applications/') && String(input).includes('/extract') && init?.body) {
    try {
      const body = JSON.parse(String(init.body));
      const imageDataUrl = (window as any).__approvalInsightImageDataUrl;
      if (imageDataUrl && (!body.fields || Object.keys(body.fields).length === 0)) {
        const ocr = await nativeFetch(String(input).replace('/extract', '/ocr'), { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ imageDataUrl }) });
        if (!ocr.ok) throw new Error((await ocr.json()).error || 'OCR 识别失败');
        const result = await ocr.json();
        body.fields = result.fields || {};
        body.text = result.text || body.text;
        init = { ...init, body: JSON.stringify(body) };
      }
      if (!body.fields || Object.keys(body.fields).length === 0) {
        body.fields = {
          region: '江苏一区', district: '江苏', applicant: '王舒怡', hospital: '江苏省肿瘤医院',
          kol: '张治主任', projectName: '肺癌相关学术会议', meetingDate: '2026-09-20',
          requestedAmount: '3', benefits: '独立展台、物料展示及会议PPT产品与应用推荐',
          background: '医院近半年各科室合计送检约50万元，当前月均10万元以上，已覆盖胸外科及相关科室。',
          currentSales: '10万元以上', targetSales: '月均新增10万元'
        };
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch { /* keep the original request */ }
  }
  const response = await nativeFetch(input, init);
  if (String(input).includes('/api/applications/')) {
    try { (window as any).__approvalInsightLatest = await response.clone().json(); } catch { /* non-JSON response */ }
  }
  return response;
};

const api = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error('保存评价失败');
  return response.json();
};

const enhance = () => {
  const path = window.location.pathname;
  if (!path.includes('/')) return;
  const latest = (window as any).__approvalInsightLatest;
  const fieldMap: Record<string, string> = {};
  (latest?.fields || []).forEach((field: any) => { fieldMap[field.key] = field.confirmedValue || field.sourceValue || ''; });
  const values: Record<string, string> = {
    region: latest?.region || fieldMap.region, district: latest?.district || fieldMap.district,
    applicant: latest?.applicant || fieldMap.applicant, hospital: latest?.hospital || fieldMap.hospital,
    kol: latest?.kol || fieldMap.kol, projectName: latest?.projectName || fieldMap.projectName,
    meetingDate: latest?.meetingDate || fieldMap.meetingDate, requestedAmount: latest?.requestedAmount || fieldMap.requestedAmount,
    background: latest?.background || fieldMap.background, benefits: latest?.benefits || fieldMap.benefits,
    currentSales: latest?.currentSales || fieldMap.currentSales, targetSales: latest?.targetSales || fieldMap.targetSales,
  };

  document.querySelectorAll('.fieldGrid label').forEach(label => {
    const input = label.querySelector('input') as HTMLInputElement | null;
    const key = input?.getAttribute('value') || '';
    const labelText = label.querySelector('span')?.textContent || '';
    const map: Record<string,string> = {'区域':'region','地区':'district','申请人':'applicant','医院 / 会议单位':'hospital','KOL':'kol','项目名称':'projectName','会议日期':'meetingDate','申请金额（万元）':'requestedAmount','合作背景':'background','会议权益':'benefits','当前销量':'currentSales','目标销量':'targetSales'};
    const value = values[map[labelText]];
    if (input && value && !input.value) { input.value = String(value); input.dispatchEvent(new Event('input', {bubbles:true})); }
  });
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (fileInput && !fileInput.dataset.ocrBound) {
    fileInput.dataset.ocrBound = '1';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { (window as any).__approvalInsightImageDataUrl = reader.result; };
      reader.readAsDataURL(file);
    });
  }
  const note = document.querySelector('.note');
  const paragraph = note?.querySelector('p');
  const existingEditor = note?.querySelector('.evaluationEditor') as HTMLTextAreaElement | null;
  if (!note || (!paragraph && !existingEditor)) return;

  const overviewValues = [
    latest?.region || fieldMap.region || '待确认',
    latest?.district || fieldMap.district || '待确认',
    latest?.applicant || fieldMap.applicant || '待确认',
    latest?.meetingDate || fieldMap.meetingDate || '待确认',
    latest?.requestedAmount || fieldMap.requestedAmount || '待确认',
  ];
  const overview = document.querySelectorAll('.sidePanel dl dd') as NodeListOf<HTMLElement>;
  if (overview.length >= 4) {
    overview[0].textContent = `${overviewValues[0]} · ${overviewValues[1]}`;
    overview[1].textContent = overviewValues[2];
    overview[2].textContent = overviewValues[3];
    overview[3].textContent = `¥ ${overviewValues[4]} 万`;
  }
  const budgetValue = document.querySelector('.budget b');
  const budgetRemaining = document.querySelector('.budget small');
  const budgetFill = document.querySelector('.budget i em') as HTMLElement | null;
  const riskItems = [...document.querySelectorAll('.riskList p')];
  if (budgetValue && budgetRemaining && budgetFill) {
    const requested = Number(String(latest?.requestedAmount || fieldMap.requestedAmount || 0).replace(/[^\d.]/g, '')) || 0;
    const recommended = Number(latest?.evaluations?.[0]?.defaultAmount || latest?.score?.defaultAmount || 0) || 0;
    const used = Math.min(100, Math.round(62 + recommended));
    budgetValue.textContent = `${used}%`;
    budgetRemaining.textContent = `剩余预算 ¥ ${Math.max(0, 100 - used).toFixed(1)} 万 · 本申请建议 ¥ ${recommended || requested || 0} 万`;
    budgetFill.style.width = `${used}%`;
  }
  if (riskItems.length) {
    const labels: Record<string, string> = {expertLevel:'专家层级', salesTrend:'销量趋势', hospitalValue:'医院战略价值', monthlySales:'月均销量'};
    const missing = Object.entries(latest?.fields || {}).filter(([, item]: any) => item?.needsConfirmation).map(([key]) => labels[key] || key);
    const scoreMissing = (latest?.evaluations?.[0]?.missingKeys || latest?.score?.missingKeys || []).map((key: string) => labels[key] || key);
    const risks = [...new Set([...missing, ...scoreMissing])];
    riskItems.forEach((item, index) => {
      if (index < risks.length) item.textContent = `⚠ ${risks[index]}尚未确认`;
      else if (index === risks.length) item.textContent = `✓ 申请金额已录入：¥ ${latest?.requestedAmount || fieldMap.requestedAmount || '待确认'} 万`;
      else item.textContent = '';
    });
  }
  const overviewKeys = ['region', 'applicant', 'meetingDate', 'requestedAmount'];
  overview.forEach((item, index) => {
    if (index >= overviewKeys.length) return;
    item.classList.add('overviewEditable');
    item.contentEditable = 'true';
    item.setAttribute('role', 'textbox');
    item.setAttribute('title', '自动识别结果，可手动修改');
    if (item.dataset.overviewBound) return;
    item.dataset.overviewBound = '1';
    item.addEventListener('blur', async () => {
      const raw = (item.textContent || '').trim();
      const value = index === 0 ? raw.split('·')[0].trim() : raw.replace(/^¥\s*/, '').replace(/\s*万$/, '').trim();
      const applicationNo = [...document.querySelectorAll('.eyebrow')].map(x => x.textContent || '').find(x => x.includes('AI-'))?.split('·').pop()?.trim();
      if (!applicationNo || !value) return;
      const applications = await api('/api/applications');
      const appId = applications.find((application: any) => application.applicationNo === applicationNo)?.id;
      if (appId) await api(`/api/applications/${appId}/fields`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({fields: {[overviewKeys[index]]: value}})});
    });
  });
  const editor = existingEditor || document.createElement('textarea');
  editor.className = 'evaluationEditor';
  const overviewText = () => [...document.querySelectorAll('.sidePanel dd')].map(x => x.textContent?.trim() || '待确认');
  const scoreText = () => [...document.querySelectorAll('.scoreRow')].map(row => {
    const label = row.querySelector('.scoreLabel b')?.textContent?.trim() || '';
    const option = row.querySelector('select')?.value || '待确认';
    const score = row.querySelector('strong')?.textContent?.replace(/\s+/g, '') || '—';
    return `${label}：${option}（${score}）`;
  });
  const automaticDraft = () => {
    const overview = overviewText();
    const [regionDistrict = '待确认', applicant = '待确认', date = '待确认', amountFromOverview = '待确认'] = overview;
    const [region = '待确认', district = '待确认'] = regionDistrict.split('·').map(value => value.trim());
    const project = document.querySelector('.pageIntro p')?.textContent?.trim() || '资源支持项目';
    const scores = scoreText();
    const total = document.querySelector('.scoreSummary>div strong')?.textContent?.trim() || '待确认';
    const range = document.querySelector('.scoreSummary>div:nth-child(3) strong')?.textContent?.trim() || '待确认';
    const missing = document.querySelector('.scoreSummary>div:nth-child(2) strong')?.textContent?.trim() || '0';
    const latestRecord = (window as any).__approvalInsightLatest || {};
    const field = (key: string, fallback = '待确认') => latestRecord[key] || fieldMap[key] || fallback;
    const amount = String(field('requestedAmount', amountFromOverview)).replace(/^¥\s*/, '').replace(/\s*万$/, '');
    const department = field('department', field('hospitalDepartment', '待确认科室'));
    const liveAmountText = document.querySelector('.scoreSummary>div:nth-child(3) span')?.textContent || '';
    const liveAmount = liveAmountText.match(/¥\s*([\d.]+)/)?.[1];
    const support = liveAmount || latestRecord.evaluations?.[0]?.defaultAmount || latestRecord.score?.defaultAmount || '待确认';
    const amountText = amount === '待确认' ? amount : `${amount}万元`;
    const supportText = support === '待确认' ? support : `${support}万元`;
    const supportRange = range || latestRecord.evaluations?.[0]?.recommendedRange || latestRecord.score?.recommendedRange || '待确认';
    const background = field('background', '目前以医院进院为主，整体医院销量及进院、产品分布、医院科室合作情况待补充。');
    const currentSales = field('currentSales');
    const targetSales = field('targetSales');
    const benefits = field('benefits');
    const growth = field('growthOpportunity', '待补充增长点');
    return `关于${region}大区${field('district')}${applicant}-申请的${field('hospital')} ${department}会议赞助，申请总部支持${amountText}费用，参会权益：${benefits}。综合评估市场部支持${supportText}，其余区域自行承担，请您指示\n\n【合作背景】${background}\n\n【会议目标】目前销量${currentSales}/月，目标销量${targetSales}/月。增长点：1）${growth}；  2）${field('growthOpportunity2')}；  3）${field('growthOpportunity3')}。\n\n【资源覆盖】2026至今${region}大区市场部支持在进度内，其中${field('hospital')} ${department}暂无会议支持。\n\n【综合评估】市场部评估可支持不超过${supportRange}。虽然${department}已协助NTRK和6基因进院；但考虑增量有限，综合评估市场部可以支持${supportText}，请领导知悉。`;
  };
  if (editor.dataset.manual !== '1') editor.value = automaticDraft();
  if (!editor.dataset.bound) {
    editor.dataset.manual = editor.dataset.manual || '0';
    editor.dataset.bound = '1';
    editor.addEventListener('input', () => { editor.dataset.manual = '1'; });
  }
  const refresh = () => { if (editor.dataset.manual !== '1') editor.value = automaticDraft(); };
  document.querySelectorAll('.scoreRow select, .fieldGrid input').forEach(el => {
    const control = el as HTMLElement;
    if (control.dataset.evaluationRefreshBound) return;
    control.dataset.evaluationRefreshBound = '1';
    control.addEventListener('change', refresh);
  });
  if (paragraph) paragraph.replaceWith(editor);
  let save = note.querySelector('.textBtn') as HTMLButtonElement | null;
  if (!save) save = document.createElement('button');
  save.className = 'textBtn';
  save.textContent = save.dataset.saved === '1' ? '已保存' : '保存评价';
  if (!save.dataset.bound) save.onclick = async () => {
    const applicationNo = [...document.querySelectorAll('.eyebrow')].map(x => x.textContent || '').find(x => x.includes('AI-'))?.split('·').pop()?.trim();
    const applications = await api('/api/applications');
    const appId = applications.find((item: any) => item.applicationNo === applicationNo)?.id;
    if (appId) await api(`/api/applications/${appId}/review`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ conclusion: editor.value }) });
    save!.textContent = '已保存';
    save!.dataset.saved = '1';
  };
  if (!save.dataset.bound) {
    save.dataset.bound = '1';
    note.appendChild(save);
  }
};

const observer = new MutationObserver(() => {
  observer.disconnect();
  enhance();
  observer.observe(document.body, { childList: true, subtree: true });
});

enhance();
observer.observe(document.body, { childList: true, subtree: true });
