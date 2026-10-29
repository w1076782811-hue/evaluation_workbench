(() => {
  'use strict';
  const SCORE_LABELS = ['不可用', '需修', '可用'];
  const ROUTE_NAMES = { dashboard: '工作台首页', setup: '评测准备', task: '评测任务', review: '评分复核', calibration: '分歧裁决', report: '评测报告', cases: '案例与改进', pe: 'PE 优化' };
  const POSITIONS = ['左上', '中上', '右上', '左中', '中', '右中', '左下', '中下', '右下'];
  const PE_FIELDS = { subject: '主体', structure: '结构', material: '材质', environment: '环境', lighting: '光照', composition: '构图' };
  const PE_EXAMPLES = ['来个蒸锅图，高级一点的', '无线耳机白底主图，要干净、有质感', '护肤精华放在梳妆台上，温馨一点'];
  const PE_REFINEMENTS = [{ key: 'darker', label: '太亮了，调暗一点' }, { key: 'brighter', label: '太暗了，调亮一点' }, { key: 'bigger', label: '主体太小，放大一点' }, { key: 'smaller', label: '主体太大，缩小一点' }, { key: 'less_busy', label: '太花了，简洁一点' }];
  const PE_HISTORY_LIMIT = 10;
  const PE_SOURCE_LABELS = { explicit: '你明确说的', user: '你明确说的', terminology: '口语转为专业描述', term: '口语转为专业描述', fuzzy: '模糊词建议', imagery: '风格建议', category: '品类默认', completion: '品类默认', guardrail: '系统约束', default: '默认补充', manual: '你手动修改的', refinement: '你后续调整的', refine: '你后续调整的' };
  const STORAGE_KEYS = { reviews: 'wb_reviews', statistics: 'wb_agreement_stat', index: 'wb_current_index', drafts: 'wb_review_drafts', pe: 'wb_pe_draft', peUnknown: 'wb_pe_unknown', theme: 'wb_theme', workspace: 'wb_workspace_v2' };
  const reportExporter = { write: report => console.log(JSON.stringify(report, null, 2)) };
  const storageAdapter = {
    read(key, fallback) {
      try { const stored = localStorage.getItem(key); return stored === null ? fallback : JSON.parse(stored); }
      catch (error) { showStorageError(error); return fallback; }
    },
    write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (error) { showStorageError(error); return false; }
    }
  };

  // Integration fragment: pure rules for the four-file, browser-local workbench.
  const DEFAULT_OUTCOME_RULES = { block_compliance_zero: true, block_p0: true };
  const SCORE_STANDARDS = [
    { code: 'L1', name: '商品本体保真', checks: ['外形、结构件数量和位置与参考一致', '材质、颜色、标识与商品信息一致'], anchors: { 2: '蒸锅层数、把手和旋钮均与参考一致，细节可直接商用。', 1: '拉丝纹理偏弱或边缘轻微变形，局部修复即可。', 0: '蒸屉增减、关键组件缺失或商品身份改变，需要重新生成。' }, applicability: '无文字时仅跳过标识与文字子项，仍检查其他商品特征。', blocking: '关键结构错误需明确记录；是否进入阻断由已确认的规则与人工裁决决定。' },
    { code: 'L2', name: '语义与指令遵循', checks: ['主体属性与指定要求绑定正确', '背景、数量、画幅及禁止项遵循原始指令'], anchors: { 2: '要求白底、横版 16:9，结果同时满足，且无额外道具。', 1: '主体正确，但占比略有偏差，可通过裁切修复。', 0: '要求白底却生成厨房，或关键主体、数量错误，需要重新生成。' }, applicability: '以实际原始指令为依据，未知要求不能由模板擅自补成商品事实。', blocking: '不得用美观程度抵消明确指令未满足的问题。' },
    { code: 'L3', name: '物理与空间合理性', checks: ['接触阴影、支撑和物体透视合理', '遮挡前后关系与物体交互合理'], anchors: { 2: '蒸锅稳放台面，阴影和遮挡关系自然。', 1: '底部接触阴影较弱，局部补阴影即可。', 0: '商品明显悬浮或结构相互穿透，无法低成本修复。' }, applicability: '单个物体且没有遮挡关系时，跳过空间层级子项。', blocking: '记录造成扣分的具体区域，避免只写“不自然”。' },
    { code: 'L4', name: '人体与交互', checks: ['肢体、手部和人体结构自然', '拿持、穿戴及商品接触关系合理'], anchors: { 2: '模特拿持商品的手指数量、关节和受力关系自然。', 1: '局部手部边缘瑕疵，不影响主体，可局部修复。', 0: '多余手指、肢体扭曲或商品穿过身体，需要重新生成。' }, applicability: '画面无人物时整个维度不适用，不计入分母。', blocking: '人物安全或合规问题另记 L8，避免只计入人体结构分。' },
    { code: 'L5', name: '光学与摄影', checks: ['主光、阴影与高光方向一致', '景深、反射、透射与材质特征合理'], anchors: { 2: '商品与场景光向一致，金属高光和接触阴影自然。', 1: '局部出现不一致高光或景深瑕疵，修复成本低。', 0: '多处光照、反射或透视冲突，整体无法商用。' }, applicability: '无镜面、玻璃或水面时跳过反射与透射子项，仍评其他光学内容。', blocking: '以画面证据判定，不把个人偏好的冷暖色调直接判为缺陷。' },
    { code: 'L6', name: '一致性与可控性', checks: ['同组商品结构、颜色和材质保持一致', '要求保持的属性不随场景变化而漂移'], anchors: { 2: '同一蒸锅在场景、白底和特写图中层数、旋钮与颜色一致。', 1: '同组中一张轻微偏色，可局部校正。', 0: '同组图片出现不同商品结构，无法组成同一商品素材组。' }, applicability: '必须有同组图片对照；单图评测整个维度不适用。', blocking: '缺少整组证据时先补充证据，不凭单张图片猜测一致性。' },
    { code: 'L7', name: '商业表现力', checks: ['商品主体、卖点和视觉层级清楚', '构图、留白和品牌调性适配约定用途'], anchors: { 2: '商品完整清晰，卖点突出，留白满足既定电商版式。', 1: '商品占比偏小或道具略抢眼，裁切或局部调整即可。', 0: '关键卖点被遮挡、商品裁切严重，无法用于约定场景。' }, applicability: '无品牌规范时可跳过品牌调性子项，但仍评构图与信息层级。', blocking: '依据明确的用途和版式判定，不把“高级感”等模糊偏好作为唯一标准。' },
    { code: 'L8', name: '合规与安全', checks: ['检查极限词、虚假或未经依据支持的商品声称', '检查约定安全和内容限制是否触发'], anchors: { 2: '没有发现约定检查范围内的合规或安全缺陷。', 1: '存在可局部移除的非阻断内容问题，需要按规则确认修复。', 0: '触发明确阻断项，例如新增“全国第一”等未经支持的极限词。' }, applicability: '始终按当前业务已确认的合规规范判定；示例不替代正式规范。', blocking: '默认 L8 为 0 分时暂缓放行，进入人工裁决；平均分不能抵消。' }
  ];
  const RUN_METADATA = TASKS.map((task, index) => ({
    run_id: ['RUN-20261029-01', 'RUN-20261022-01', 'RUN-20261015-01'][index],
    task_id: task.task_id, model_version: task.model_version, dataset_version: 'EC-DEMO-v1',
    standard_version: 'rubric-v1.1', pe_version: 'pe-v1.2', seed: '未记录（演示）',
    generation_params: { size: '未记录（演示）', steps: '未记录（演示）' },
    purpose: '本地演示', sampling_strategy: '演示全集', source: 'demo',
    total: task.total, done: task.done, status: task.status, created_at: task.created_at,
    sample_count: index === 0 ? SAMPLES.length : 0
  }));

  function calculateWeightedQuality({ sample, scores }) {
    const dimensions = DIMENSIONS.filter(dimension => sample.applicable_dims.includes(dimension.code));
    if (!dimensions.length || dimensions.some(dimension => ![0, 1, 2].includes(scores[dimension.code]))) return null;
    const weight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
    return dimensions.reduce((sum, dimension) => sum + dimension.weight * scores[dimension.code], 0) / (2 * weight);
  }

  function getBlockingReasons({ sample, scores, defects, rules }) {
    const reasons = [];
    if (rules.block_compliance_zero && sample.applicable_dims.includes('L8') && scores.L8 === 0) reasons.push('合规与安全 L8 为 0 分，暂缓放行，等待人工裁决。');
    if (rules.block_p0 && defects.some(defect => defect.severity === 'P0' && defect.confirmed === true && defect.source === 'human')) reasons.push('存在人工确认的 P0 缺陷，暂缓放行，等待人工裁决。');
    return reasons;
  }

  function calculateOutcome({ sample, scores = {}, defects = [], rules = DEFAULT_OUTCOME_RULES, adjudication = null }) {
    const labels = { pending: '待评完', blocked: '暂缓放行', usable: '可用', repair: '需修', discard: '废弃' };
    const finalScores = adjudication?.final_scores || scores;
    const finalDefects = adjudication?.final_defects || defects;
    const quality = calculateWeightedQuality({ sample, scores: finalScores });
    if (quality === null) return { status: 'pending', label: labels.pending, reasons: ['仍有适用维度未完成有效评分。'], quality };
    const reasons = getBlockingReasons({ sample, scores: finalScores, defects: finalDefects, rules });
    const confirmed = adjudication && ['blocked', 'usable', 'repair', 'discard'].includes(adjudication.decision) && adjudication.reason?.trim() && adjudication.reviewer?.trim();
    if (confirmed) return { status: adjudication.decision, label: labels[adjudication.decision], reasons: [`${adjudication.reviewer} 已裁决：${adjudication.reason}`, ...reasons], quality };
    if (reasons.length) return { status: 'blocked', label: labels.blocked, reasons, quality };
    const values = sample.applicable_dims.map(code => finalScores[code]);
    const status = values.includes(0) ? 'discard' : values.includes(1) ? 'repair' : 'usable';
    const reason = status === 'discard' ? '至少一个适用维度为 0 分，按当前量表需要重新生成。' : status === 'repair' ? '存在 1 分维度，需要完成对应修复。' : '所有适用维度均为 2 分，且未触发当前阻断规则。';
    return { status, label: labels[status], reasons: [reason], quality };
  }

  function isImportRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function isImportText(value) { return typeof value === 'string' && value.trim().length > 0; }

  function validateRunMetadata(run) {
    if (!isImportRecord(run)) return ['run 必须是包含本轮评测条件的对象。'];
    const fields = ['run_id', 'model_version', 'dataset_version', 'standard_version', 'pe_version', 'purpose', 'sampling_strategy'];
    const errors = fields.filter(key => !isImportText(run[key])).map(key => `run.${key} 必须填写，未知信息请明确写“待补充”。`);
    if (!(isImportText(run.seed) || Number.isFinite(run.seed))) errors.push('run.seed 必须填写数字或明确的未知说明。');
    if (!isImportRecord(run.generation_params)) errors.push('run.generation_params 必须是对象，未知参数请明确注明。');
    return errors;
  }

  function validateSampleDimensions(sample, prefix) {
    const codes = DIMENSIONS.map(dimension => dimension.code);
    const applicable = sample.applicable_dims;
    if (!Array.isArray(applicable) || !applicable.length || applicable.some(code => !codes.includes(code)) || new Set(applicable).size !== applicable.length) return [`${prefix}.applicable_dims 必须是非空、无重复的 L1–L8 编码数组。`];
    const errors = [];
    if (!isImportRecord(sample.machine_scores)) return [`${prefix}.machine_scores 必须是对象；执行失败也请提供空对象。`];
    if (Object.keys(sample.machine_scores).some(code => !codes.includes(code))) errors.push(`${prefix}.machine_scores 含未知维度。`);
    const complete = (sample.machine_status || 'complete') === 'complete';
    codes.forEach(code => {
      const score = sample.machine_scores[code];
      if (applicable.includes(code)) {
        if (complete && ![0, 1, 2].includes(score)) errors.push(`${prefix}.${code} 为适用项，完整机器结果必须是 0/1/2。`);
        if (!complete && score != null && ![0, 1, 2].includes(score)) errors.push(`${prefix}.${code} 只能为 0/1/2/null。`);
      } else if (score != null) errors.push(`${prefix}.${code} 不适用，机器分必须为 null 或不填，不能用 0 分代替。`);
    });
    if (sample.evaluation_mode === 'single' && applicable.includes('L6')) errors.push(`${prefix} 是单图评测，L6 应从适用维度中移除。`);
    return errors;
  }

  function validateSampleDefects(sample, prefix) {
    if (!Array.isArray(sample.machine_defects)) return [`${prefix}.machine_defects 必须是数组，没有缺陷请填 []。`];
    const codes = DEFECT_CODES.map(defect => defect.code);
    return sample.machine_defects.flatMap((defect, index) => {
      if (!isImportRecord(defect)) return [`${prefix}.machine_defects[${index}] 必须是对象。`];
      const errors = [];
      if (!codes.includes(defect.code)) errors.push(`${prefix} 含未注册的缺陷编码 ${String(defect.code)}。`);
      if (!['P0', 'P1', 'P2', 'P3'].includes(defect.severity)) errors.push(`${prefix} 的缺陷严重度必须是 P0/P1/P2/P3。`);
      if (!isImportText(defect.position) || !isImportText(defect.note)) errors.push(`${prefix} 的每条缺陷都需要位置和具体说明。`);
      return errors;
    });
  }

  function validateImportSample(sample, index) {
    const prefix = `samples[${index}]`;
    if (!isImportRecord(sample)) return [`${prefix} 必须是样本对象。`];
    const fields = ['sample_id', 'category', 'image_type', 'prompt_raw'];
    const errors = fields.filter(key => !isImportText(sample[key])).map(key => `${prefix}.${key} 必须填写。`);
    if (!['single', 'group'].includes(sample.evaluation_mode)) errors.push(`${prefix}.evaluation_mode 必须是 single 或 group。`);
    if (sample.evaluation_mode === 'group' && !isImportText(sample.group_id)) errors.push(`${prefix} 组图评测需要 group_id。`);
    if (sample.machine_status && !['complete', 'failed', 'uncertain'].includes(sample.machine_status)) errors.push(`${prefix}.machine_status 必须是 complete/failed/uncertain。`);
    if (sample.machine_evidence != null && !Array.isArray(sample.machine_evidence)) errors.push(`${prefix}.machine_evidence 必须是证据数组。`);
    if (Array.isArray(sample.machine_evidence) && sample.machine_evidence.some(entry => !isImportRecord(entry))) errors.push(`${prefix}.machine_evidence 每一项都必须是证据对象。`);
    return [...errors, ...validateSampleDimensions(sample, prefix), ...validateSampleDefects(sample, prefix)];
  }

  function normalizeImportSample(sample) {
    const scores = Object.fromEntries(DIMENSIONS.map(dimension => [dimension.code, sample.machine_scores[dimension.code] ?? null]));
    return { ...sample, machine_status: sample.machine_status || 'complete', machine_scores: scores,
      difficulty: sample.difficulty || '待补充', reference_image: sample.reference_image || '', generated_image: sample.generated_image || '',
      machine_defects: sample.machine_defects.map(defect => ({ ...defect, source: 'machine', confirmed: false })),
      machine_evidence: sample.machine_evidence || [], group_id: sample.evaluation_mode === 'group' ? sample.group_id : null };
  }

  function validateImport(payload) {
    if (!isImportRecord(payload)) return { ok: false, errors: ['导入内容必须是包含 run 和 samples 的 JSON 对象。'], run: null, samples: [] };
    const errors = validateRunMetadata(payload.run);
    if (!Array.isArray(payload.samples) || !payload.samples.length) return { ok: false, errors: [...errors, 'samples 必须是非空样本数组。'], run: null, samples: [] };
    payload.samples.forEach((sample, index) => errors.push(...validateImportSample(sample, index)));
    const ids = payload.samples.filter(isImportRecord).map(sample => sample.sample_id);
    if (new Set(ids).size !== ids.length) errors.push('同一轮导入中 sample_id 不能重复。');
    payload.samples.filter(isImportRecord).forEach(sample => {
      if (sample.evaluation_mode === 'group' && Array.isArray(sample.applicable_dims) && sample.applicable_dims.includes('L6') && payload.samples.filter(peer => peer?.group_id === sample.group_id).length < 2) errors.push(`${sample.sample_id} 缺少同组对照图，不能评 L6。`);
    });
    if (errors.length) return { ok: false, errors, run: null, samples: [] };
    const samples = payload.samples.map(normalizeImportSample);
    const run = { ...payload.run, source: 'imported', sample_count: samples.length, total: samples.length, done: samples.filter(sample => sample.machine_status === 'complete').length };
    return { ok: true, errors: [], run, samples };
  }

  const workspaceDefault = {
    runs: structuredClone(RUN_METADATA), imports: {}, activeRunId: RUN_METADATA[0].run_id,
    rules: { ...DEFAULT_OUTCOME_RULES }, standards: structuredClone(SCORE_STANDARDS),
    adjudications: [], history: [], cases: [], experiments: [], efficiency: {}
  };
  const state = {
    workspace: storageAdapter.read(STORAGE_KEYS.workspace, workspaceDefault),
    reviews: storageAdapter.read(STORAGE_KEYS.reviews, []), currentIndex: storageAdapter.read(STORAGE_KEYS.index, 0),
    drafts: storageAdapter.read(STORAGE_KEYS.drafts, {}),
    pe: normalizePeDraft(storageAdapter.read(STORAGE_KEYS.pe, null)), peUnknown: storageAdapter.read(STORAGE_KEYS.peUnknown, {}),
    charts: [], route: '', toastTimer: null, filter: '', queue: { category: '', status: 'all', search: '' },
    reportSource: 'human', selectedCalibration: '', compareRunId: '', imageDb: null, imageUrls: {}, imageUpload: null, timer: null, pendingImportErrors: null
  };
  state.reviews = state.reviews.map(review => ({ ...review, run_id: review.run_id || RUN_METADATA[0].run_id, revision: review.revision || 1, standard_version: review.standard_version || 'rubric-v1.1', elapsed_ms: review.elapsed_ms || 0, defects: (review.defects || []).map(defect => ({ ...defect, source: 'human', confirmed: true })) }));
  Object.keys(state.drafts).filter(key => !key.includes(':')).forEach(key => { state.drafts[`${RUN_METADATA[0].run_id}:${key}`] = state.drafts[key]; delete state.drafts[key]; });
  Object.values(state.drafts).forEach(draft => { draft.defects = (draft.defects || []).map(defect => ({ ...defect, source: 'human', confirmed: true })); });
  state.workspace.runs.forEach(run => { run.rules ||= { ...DEFAULT_OUTCOME_RULES }; run.standards ||= structuredClone(SCORE_STANDARDS); });
  state.reviews.forEach(review => { review.rules_snapshot ||= { ...DEFAULT_OUTCOME_RULES }; });
  state.currentIndex = Math.max(0, Math.min(getSamples().length - 1, Number(state.currentIndex) || 0));
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function icon(name) { return `<svg class="nav-icon" aria-hidden="true"><use href="#i-${name}"/></svg>`; }

  function percent(value) { return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`; }

  function getRelativeChange(previous, current) { return previous === 0 ? null : (current - previous) / previous; }

  function formatChange(value) { return value === null ? '—（无基线）' : `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`; }

  function showStorageError(error) {
    const notice = document.querySelector('#storage-notice');
    notice.hidden = false;
    notice.textContent = '浏览器本地存储不可用或数据损坏。当前操作仍可演示，但请勿依赖刷新后恢复。';
    console.warn('工作台本地存储异常', error);
  }

  function toast(message) {
    const element = document.querySelector('#toast');
    clearTimeout(state.toastTimer);
    element.textContent = message;
    element.classList.add('visible');
    state.toastTimer = setTimeout(() => element.classList.remove('visible'), 2800);
  }

  function heading(options) {
    return `<div class="page-heading"><div><div class="eyebrow">${options.eyebrow}</div><h1>${options.title}</h1><p class="muted">${options.description}</p></div><div class="page-actions">${options.actions || ''}</div></div>`;
  }

  function getStatistics() {
    return getStatisticRows().reduce((result, review) => ({ total_items: result.total_items + review.agreement.total_items, agree_items: result.agree_items + review.agreement.agree_items, samples: result.samples + 1 }), { total_items: 0, agree_items: 0, samples: 0 });
  }

  function persistStatistics() {
    const statistic = getStatistics();
    return storageAdapter.write(STORAGE_KEYS.statistics, { total_items: statistic.total_items, agree_items: statistic.agree_items });
  }

  function getDraft() {
    const sample = getSamples()[state.currentIndex];
    const key = getReviewKey(sample.sample_id);
    if (state.drafts[key]) return state.drafts[key];
    const saved = findReview(sample.sample_id);
    state.drafts[key] = saved ? {
      scores: { ...saved.human_scores }, blindMode: saved.blind_mode, revealed: saved.blind_mode, exposed: true,
      eligible: Boolean(saved.agreement), saved: true, defects: saved.defects || [], note: saved.note || '',
      position: '中', code: DEFECT_CODES[0].code, severity: 'P2', elapsedMs: saved.elapsed_ms || 0, marker: null
    } : { scores: {}, blindMode: true, revealed: false, exposed: false, eligible: true, saved: false, defects: [], note: '', position: '中', code: DEFECT_CODES[0].code, severity: 'P2', elapsedMs: 0, marker: null };
    return state.drafts[key];
  }

  function persistDraft() { return storageAdapter.write(STORAGE_KEYS.drafts, state.drafts); }

  function getAgreement(sample, scores) {
    const comparable = sample.applicable_dims.filter(code => Number.isInteger(sample.machine_scores[code]));
    const count = comparable.filter(code => scores[code] === sample.machine_scores[code]).length;
    return comparable.length ? { agree_items: count, total_items: comparable.length, rate: count / comparable.length } : null;
  }

  function getQuality(sample, scores) {
    const selected = DIMENSIONS.filter(dimension => sample.applicable_dims.includes(dimension.code));
    const weights = selected.reduce((total, dimension) => total + dimension.weight, 0);
    return selected.reduce((total, dimension) => total + scores[dimension.code] * dimension.weight, 0) / (2 * weights);
  }

  function renderDashboard() {
    const run = getActiveRun();
    const records = getReportRecords('human');
    const counts = getOutcomeCounts(records);
    const statistics = getStatistics();
    const pending = getReviews().filter(needsAdjudication).length;
    const averages = getDimensionAverages(records);
    document.querySelector('#page-dashboard').innerHTML = heading({ eyebrow: 'OVERVIEW / 当前评测', title: '从独立判断，到可追溯的结论', description: '首页根据当前批次的实际保存记录更新，不把预置快照混作人工结果。', actions: '<a class="button primary" href="#/review">进入评分复核 →</a>' }) +
      `<div class="summary-strip"><span>批次 <strong class="mono">${escapeHtml(run.run_id)}</strong></span><span>模型 <strong>${escapeHtml(run.model_version)}</strong></span><span>样本 <strong>${getSamples().length}</strong></span><span>已人审 <strong>${records.length}</strong></span>${statusPill('open', run.source === 'demo' ? '演示批次' : '本地导入')}</div>` +
      `<div class="kpi-grid">${metricCard('初判可用率', records.length ? percent(counts.usable / records.length) : '—', `仅计算已保存的 ${records.length} 条初判`, 'green')}${metricCard('初判需修率', records.length ? percent(counts.repair / records.length) : '—', `另有 ${counts.discard} 条不可用`, 'amber')}${metricCard('待裁决样本', pending, '分歧、严重问题或机器结果不确定', 'amber')}${metricCard('独立盲判一致率', statistics.total_items ? percent(statistics.agree_items / statistics.total_items) : '—', `${statistics.samples} 条独立初判 · 不等于机器准确率`, 'blue')}</div>
      <div class="section-grid"><article class="card"><div class="card-heading"><h2>这一轮接下来做什么</h2></div><div class="todo-list"><a class="todo-item" href="#/setup"><span><strong>确认评测集与规则</strong><small>${escapeHtml(run.dataset_version)} · ${escapeHtml(run.standard_version)}</small></span><span>→</span></a><a class="todo-item" href="#/review"><span><strong>完成剩余复核</strong><small>${getSamples().length - getReviews().length} 条未保存，可按品类和状态筛选</small></span><span>→</span></a><a class="todo-item" href="#/calibration"><span><strong>处理分歧与阻断</strong><small>${pending} 条待裁决，保留原始初判</small></span><span>→</span></a><a class="todo-item" href="#/cases"><span><strong>跟进案例与回归</strong><small>${state.workspace.cases.filter(item => item.run_id === run.run_id && item.status !== 'done').length} 项未完成</small></span><span>→</span></a></div></article><article class="card"><div class="card-heading"><h2>已人审的维度表现</h2><a href="#/report">查看报告 →</a></div>${DIMENSIONS.map(dimension => `<div class="dimension-summary-row"><span class="mono">${dimension.code}</span><span>${dimension.name}</span><strong>${averages[dimension.code].score === null ? '—' : averages[dimension.code].score.toFixed(2)}<small> / 2 · n=${averages[dimension.code].count}</small></strong></div>`).join('')}</article></div>
      ${run.source === 'demo' ? '<details class="card"><summary>查看预置历史模型快照（与本地人审分开）</summary><div class="dashboard-grid"><div><h2>八维雷达 · 预置 v1.3 / v1.4</h2><div class="chart-wrap" id="radar-wrap"><canvas id="radar-chart" height="270"></canvas></div></div><div><h2>可用率趋势 · 预置快照</h2><div class="chart-wrap" id="trend-wrap"><canvas id="trend-chart" height="270"></canvas></div></div></div></details>' : ''}`;
  }

  function getDefectCounts() {
    const records = getReportRecords();
    return DEFECT_CODES.map(defect => ({ ...defect, count: records.filter(record => record.defects.some(item => item.code === defect.code)).length })).sort((left, right) => right.count - left.count);
  }

  function renderTasks() {
    const rows = state.workspace.runs;
    document.querySelector('#page-task').innerHTML = heading({ eyebrow: 'TASKS / 运行记录', title: '同一道题、同一套规则，再比较版本', description: '切换批次会分别恢复复核记录，不按样本编号覆盖其他轮次。', actions: '<button class="button primary" data-action="import-dataset">导入新批次</button>' }) +
      `<article class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>运行编号 / 模型</th><th>评测集 / 规则</th><th>样本 / 已人审</th><th>来源 / 创建时间</th><th>操作</th></tr></thead><tbody>${rows.map(run => { const available = state.workspace.imports[run.run_id]?.length || run.sample_count || 0; const reviewed = state.reviews.filter(review => review.run_id === run.run_id).length; return `<tr><td><strong class="mono">${escapeHtml(run.run_id)}</strong><small>${escapeHtml(run.model_version)}</small></td><td>${escapeHtml(run.dataset_version)}<small>${escapeHtml(run.standard_version)} · ${escapeHtml(run.pe_version)}</small></td><td>${available} / ${reviewed}<small>${run.total || available} 条任务总数${!available ? '，仅有历史快照' : ''}</small></td><td>${run.source === 'demo' ? '预置演示' : '本地导入'}<small>${escapeHtml(run.created_at)}</small></td><td>${available ? `<button class="button ${run.run_id === getActiveRun().run_id ? 'ghost' : 'secondary'} small" data-action="select-run" data-id="${escapeHtml(run.run_id)}">${run.run_id === getActiveRun().run_id ? '当前批次' : '切换到本批次'}</button>` : '<span class="muted">无逐条数据</span>'}</td></tr>`; }).join('')}</tbody></table></div></article><article class="card"><h2>当前批次</h2>${renderRunSummary()}<a class="button primary" href="#/review">查看评分详情 →</a></article>`;
  }


  function renderImage(sample, generated) {
    const key = `${getReviewKey(sample.sample_id)}:${generated ? 'generated' : 'reference'}`;
    const imageUrl = state.imageUrls[key];
    const filename = generated ? sample.generated_image : sample.reference_image;
    const draft = getDraft();
    return `<article class="card image-card"><div class="card-heading"><h2>${generated ? '生成图' : '参考图'}</h2><span class="pill gray">${generated ? escapeHtml(getActiveRun().model_version) : '商品原图'}</span></div><div class="image-stage" data-image-key="${escapeHtml(key)}" ${generated ? 'data-mark-stage="true"' : ''}>${imageUrl ? `<img class="real-image" src="${imageUrl}" alt="${escapeHtml(sample.sample_id)} ${generated ? '生成图' : '参考图'}">` : `<div class="image-placeholder"><div class="placeholder-frame">${icon('image')}<span class="placeholder-label">${escapeHtml(sample.sample_id)}</span><span>等待关联本地图片</span></div></div>`}${generated && draft.marker ? `<span class="image-mark" style="left:${draft.marker.x * 100}%;top:${draft.marker.y * 100}%">缺陷位置</span>` : ''}</div><div class="image-tools"><button class="button ghost small" data-action="upload-image" data-kind="${generated ? 'generated' : 'reference'}">${imageUrl ? '更换图片' : '关联本地图片'}</button><button class="button ghost small" data-action="zoom-image" data-key="${escapeHtml(key)}" ${imageUrl ? '' : 'disabled'}>放大查看</button></div><div class="image-meta mono">${escapeHtml(filename)}</div>${generated ? `<h3>评测上下文</h3><p class="muted">${escapeHtml(sample.evaluation_context || '未提供上下文')}</p><span class="pill gray">${sample.evaluation_mode === 'single' ? '单图评测' : '同组对照'}</span><p class="muted">点击生成图可标记缺陷位置，随人工缺陷记录保存。</p>` : `<h3>原始指令</h3><p class="prompt-block">${escapeHtml(sample.prompt_raw)}</p>`}</article>`;
  }

  function renderScoreRow(dimension, sample, draft) {
    const applicable = sample.applicable_dims.includes(dimension.code);
    const locked = draft.revealed && draft.blindMode || draft.saved;
    const visible = !draft.blindMode || draft.revealed;
    const machineScore = sample.machine_scores[dimension.code];
    const match = draft.scores[dimension.code] === machineScore;
    const hasMachine = Number.isInteger(machineScore);
    const machineCell = !applicable ? '<span class="na-label">不适用</span>' : visible ? hasMachine ? `<span class="${draft.blindMode && draft.revealed ? match ? 'match' : 'mismatch' : ''}">${draft.blindMode && draft.revealed ? match ? '✓' : '✗' : ''} ${machineScore} ${SCORE_LABELS[machineScore]}</span>` : '<span class="na-label">无有效结果</span>' : '<span class="machine-mask">盲判中</span>';
    const standard = getStandards().find(item => item.code === dimension.code);
    return `<div class="score-row ${applicable ? '' : 'not-applicable'}" data-dim="${dimension.code}"><div class="dimension-label"><button class="dimension-code button ghost small" data-action="standard" data-code="${dimension.code}" title="查看具体标准">${dimension.code}</button><span>${dimension.name}<small>权重 ${dimension.weight}%${applicable ? '' : ' · 不适用'}</small></span></div><div class="score-options" role="group" aria-label="${dimension.name}人工评分">${[2, 1, 0].map(score => `<button class="score-button ${draft.scores[dimension.code] === score ? 'selected' : ''}" data-action="score" data-dim="${dimension.code}" data-score="${score}" title="${escapeHtml(standard.anchors[score])}" aria-pressed="${draft.scores[dimension.code] === score}" ${!applicable || locked ? 'disabled' : ''}>${score}<span> ${SCORE_LABELS[score]}</span></button>`).join('')}</div><div class="machine-cell">${machineCell}</div></div>`;
  }

  function renderReview() {
    const indices = getQueueIndices();
    if (!indices.length) {
      document.querySelector('#page-review').innerHTML = heading({ eyebrow: 'HUMAN REVIEW / 人工复核', title: '当前队列没有匹配样本', description: '调整筛选条件，或在评测准备页导入数据。' }) + renderQueue() + '<article class="card empty-state">当前筛选结果为 0 条，不会对队列外样本评分。<button class="button secondary" data-action="reset-queue">清除筛选</button></article>';
      return;
    }
    if (!indices.includes(state.currentIndex)) { state.currentIndex = indices[0]; storageAdapter.write(STORAGE_KEYS.index, state.currentIndex); }
    const sample = getSamples()[state.currentIndex];
    if (!sample) { document.querySelector('#page-review').innerHTML = heading({ eyebrow: 'REVIEW', title: '当前批次没有逐条数据', description: '请先导入一批已有评测结果。', actions: '<a class="button primary" href="#/setup">进入评测准备</a>' }); return; }
    const draft = getDraft();
    const selected = sample.applicable_dims.filter(code => Number.isInteger(draft.scores[code])).length;
    const completed = selected === sample.applicable_dims.length;
    const agreement = getAgreement(sample, draft.scores);
    const outcome = getOutcome(sample, { scores: draft.scores, defects: draft.defects });
    document.querySelector('#page-review').innerHTML = heading({ eyebrow: 'HUMAN REVIEW / 人工复核', title: '先独立判断，再对齐标准', description: '点击维度编码看评分依据。机器评分和证据在揭晓前隐藏。', actions: `<span class="pill blue">${getReviews().length} / ${getSamples().length} 条已保存</span>` }) + renderQueue() +
      `<div class="card review-toolbar"><label class="switch-control"><input id="blind-toggle" type="checkbox" role="switch" ${draft.blindMode ? 'checked' : ''} ${draft.saved || draft.revealed ? 'disabled' : ''}><span class="switch"></span><strong>盲判模式</strong></label><div class="review-timer"><button class="button secondary small" data-action="timer" ${draft.saved ? 'disabled' : ''}>${state.timer ? '暂停计时' : '开始计时'}</button><span id="review-timer-value">${formatDuration(getElapsedMs())}</span></div><div class="review-pagination"><span class="review-count">第 ${state.currentIndex + 1} / ${getSamples().length} 条</span><button class="button secondary small" data-action="previous" ${!indices.length || indices.indexOf(state.currentIndex) <= 0 ? 'disabled' : ''}>上一条</button><button class="button secondary small" data-action="next" ${indices.indexOf(state.currentIndex) === indices.length - 1 || !indices.length ? 'disabled' : ''}>下一条</button></div></div>
      ${indices.length ? '' : '<div class="notice">当前筛选没有匹配样本。下方保留当前样本，可切回“全部样本”。</div>'}<div class="sample-title"><strong class="mono">${escapeHtml(sample.sample_id)}</strong><span>${escapeHtml(sample.category)}</span><span>${escapeHtml(sample.image_type)}</span><span class="muted">${sample.applicable_dims.length} 个适用维度 · ${escapeHtml(getActiveRun().sampling_strategy)}</span></div>
      <div class="review-layout">${renderImage(sample, false)}<article class="card score-card"><div class="card-heading"><h2>八维评分</h2><span class="muted">2 可用 / 1 需修 / 0 不可用</span></div><div class="score-table-header"><span>维度 / 点击看标准</span><span>人工判定</span><span>机器判定</span></div><div class="score-table">${DIMENSIONS.map(dimension => renderScoreRow(dimension, sample, draft)).join('')}</div><div class="review-summary">${draft.blindMode && !draft.revealed ? `盲判中，请先独立判定 ${sample.applicable_dims.length} 个适用维度` : draft.blindMode && agreement ? `<strong>本条一致 ${agreement.agree_items}/${agreement.total_items}（${percent(agreement.rate)}）</strong>` : '本条不计入独立盲判一致率或暂无可比机器结果'}<small>${completed ? `加权质量分 ${percent(getQuality(sample, draft.scores))} · ` : ''}未评分维度不按 0 分处理</small></div>${completed ? `<div class="decision-card">${statusPill(outcome.status, outcome.label)}<span>${outcome.reasons.map(escapeHtml).join('；')}</span></div>` : ''}${!draft.eligible ? '<p class="notice compact">已看过机器答案，重判只记录人工结论，不计入独立盲判一致率。</p>' : ''}<div class="review-actions">${draft.blindMode && !draft.revealed ? `<button class="button primary" data-action="reveal" ${completed ? '' : 'disabled'}>揭晓机器评分（${selected}/${sample.applicable_dims.length} 已选）</button>` : `<span class="pill gray">${draft.saved ? '已保存 · 初判保留' : '已揭晓'}</span>`}${draft.revealed || draft.saved ? '<button class="button ghost" data-action="rejudge">重判本条</button>' : ''}</div>${draft.revealed || !draft.blindMode ? renderMachineDefects(sample) : ''}</article>${renderImage(sample, true)}</div>
      ${renderGroupGallery(sample)}${renderDefectPanel(draft)}<div class="review-bottom"><span class="muted">保存初判后，分歧和严重问题进入裁决队列。人审报告随保存更新。</span><button class="button primary" data-action="save" ${completed && (!draft.blindMode || draft.revealed) && !draft.saved ? '' : 'disabled'}>保存并下一条 →</button></div>`;
  }

  function renderMachineDefects(sample) {
    const evidence = sample.machine_evidence || [];
    return `<details class="machine-defects"><summary>机器结果与判断证据（${sample.machine_defects.length} 条缺陷）</summary><p>执行状态：${escapeHtml(sample.machine_status || 'complete')} · ${sample.machine_confidence == null ? '未提供置信度' : `置信度 ${percent(sample.machine_confidence)}`}</p><ul>${sample.machine_defects.map(defect => `<li><span class="mono">${escapeHtml(defect.code)}</span> · ${escapeHtml(defect.position)} · ${escapeHtml(defect.severity)}<p>${escapeHtml(defect.note)}</p></li>`).join('')}</ul>${evidence.length ? `<ul class="evidence-list">${evidence.map(item => `<li>${escapeHtml(item.layer || '未注明来源')}：${escapeHtml(item.note || JSON.stringify(item))}</li>`).join('')}</ul>` : '<p class="muted">本批次未提供 OCR 实测值或视觉模型依据，请补充后再定位自动评分问题。</p>'}</details>`;
  }

  function renderDefectPanel(draft) {
    const sample = getSamples()[state.currentIndex];
    const subRules = sample.subdimension_applicability || {};
    const defectOptions = DEFECT_CODES.map(defect => {
      const subcode = { 'L1-02': 'L1-2', 'L3-02': 'L3-2' }[defect.code];
      const disabled = subRules[subcode] === false;
      return `<option value="${defect.code}" ${draft.code === defect.code ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${defect.code} · ${defect.name}${disabled ? '（不适用）' : ''}</option>`;
    }).join('');
    return `<article class="card defect-panel"><div class="card-heading"><div><h2>缺陷记录</h2><p class="card-subtitle">定位具体问题，留下可复现的修改依据。</p></div><span class="pill gray">${draft.defects.length} 条人工缺陷</span></div><div class="defect-grid"><div><div class="field-label">缺陷位置 · 九宫格</div><div class="position-grid">${POSITIONS.map(position => `<button class="position-button ${draft.position === position ? 'selected' : ''}" data-action="position" data-value="${position}" aria-pressed="${draft.position === position}" ${draft.saved ? 'disabled' : ''}>${position}</button>`).join('')}</div><button class="button ghost small ${draft.position === '全图' ? 'selected' : ''}" data-action="position" data-value="全图" ${draft.saved ? 'disabled' : ''}>全图</button></div><div class="field"><label class="field-label" for="defect-code">缺陷编码</label><select id="defect-code" ${draft.saved ? 'disabled' : ''}>${defectOptions}</select><span class="field-label">严重度</span><div class="severity-options">${['P0', 'P1', 'P2', 'P3'].map(severity => `<button class="severity-button ${draft.severity === severity ? 'selected' : ''}" data-action="severity" data-value="${severity}" aria-pressed="${draft.severity === severity}" ${draft.saved ? 'disabled' : ''}>${severity}</button>`).join('')}</div></div><div class="field"><label class="field-label" for="defect-note">复核备注 / 关键缺陷</label><textarea id="defect-note" rows="3" placeholder="例如：蒸锅底部缺少接触阴影，商品出现悬浮感。" ${draft.saved ? 'disabled' : ''}>${escapeHtml(draft.note)}</textarea><button class="button secondary small" data-action="add-defect" ${draft.saved ? 'disabled' : ''}>添加缺陷记录</button></div></div><div class="defect-list">${draft.defects.map((defect, index) => `<div class="defect-item"><span class="pill gray">${defect.severity}</span><span class="mono">${defect.code}</span><span>${defect.position}</span><span>${escapeHtml(defect.note)}</span><button class="button ghost small" data-action="remove-defect" data-index="${index}" ${draft.saved ? 'disabled' : ''} aria-label="删除第 ${index + 1} 条缺陷">移除</button></div>`).join('')}</div>${Object.keys(subRules).length ? `<details class="applicability-details"><summary>子项适用性说明</summary><p class="muted">${Object.entries(subRules).map(([code, applicable]) => `${code}：${applicable ? '适用' : '不适用'}`).join('；')}。子项不适用不代表整个父维度不适用；父维度仍按其余适用内容判定。</p></details>` : ''}</article>`;
  }

  function setScore(button) {
    const draft = getDraft();
    if (draft.saved || draft.blindMode && draft.revealed) return;
    draft.scores[button.dataset.dim] = Number(button.dataset.score);
    persistDraft(); renderReview();
    document.querySelector(`.score-button[data-dim="${button.dataset.dim}"][data-score="${button.dataset.score}"]`).focus({ preventScroll: true });
  }

  function revealScores() {
    const sample = getSamples()[state.currentIndex];
    const draft = getDraft();
    if (!sample.applicable_dims.every(code => Number.isInteger(draft.scores[code]))) return;
    draft.revealed = true; draft.exposed = true;
    persistDraft(); renderReview();
  }

  function switchBlindMode(checked) {
    const draft = getDraft();
    if (draft.saved || draft.revealed) return;
    draft.blindMode = checked;
    if (!checked) { draft.exposed = true; draft.eligible = false; }
    persistDraft(); renderReview();
  }

  function saveReview() {
    const sample = getSamples()[state.currentIndex];
    const draft = getDraft();
    if (draft.saved || draft.blindMode && !draft.revealed || !sample.applicable_dims.every(code => Number.isInteger(draft.scores[code]))) return;
    pauseTimer();
    const previousRevisions = state.workspace.history.filter(review => review.run_id === getActiveRun().run_id && review.sample_id === sample.sample_id);
    const review = {
      run_id: getActiveRun().run_id, sample_id: sample.sample_id, task_id: getActiveRun().task_id, human_scores: { ...draft.scores }, machine_scores: { ...sample.machine_scores }, applicable_dims: [...sample.applicable_dims],
      agreement: draft.blindMode && draft.eligible && (!sample.machine_status || sample.machine_status === 'complete') ? getAgreement(sample, draft.scores) : null,
      weighted_quality: getQuality(sample, draft.scores), blind_mode: draft.blindMode, defects: structuredClone(draft.defects), note: draft.note,
      revision: previousRevisions.length + 1, elapsed_ms: draft.elapsedMs || 0, standard_version: getActiveRun().standard_version, rules_snapshot: { ...getActiveRun().rules }, saved_at: new Date().toISOString()
    };
    const next = [...state.reviews.filter(item => item.run_id !== review.run_id || item.sample_id !== review.sample_id), review];
    if (!storageAdapter.write(STORAGE_KEYS.reviews, next)) { toast('保存失败，请检查浏览器存储。'); return; }
    state.reviews = next; draft.saved = true; persistStatistics(); persistDraft();
    const nextIndex = getQueueIndices().find(index => index > state.currentIndex && !findReview(getSamples()[index].sample_id));
    if (nextIndex !== undefined) state.currentIndex = nextIndex;
    storageAdapter.write(STORAGE_KEYS.index, state.currentIndex); renderReview(); updateBadges();
    toast(needsAdjudication(review) ? '初判已保存，分歧或严重问题已进入裁决队列。' : '已保存，人审报告已更新。');
  }

  function moveSample(offset) {
    pauseTimer(); persistDraft();
    const indices = getQueueIndices();
    const position = indices.indexOf(state.currentIndex);
    state.currentIndex = indices[Math.max(0, Math.min(indices.length - 1, position + offset))] ?? state.currentIndex;
    storageAdapter.write(STORAGE_KEYS.index, state.currentIndex); renderReview();
  }

  function rejudgeSample() {
    pauseTimer();
    const sample = getSamples()[state.currentIndex];
    const review = findReview(sample.sample_id);
    if (review) state.workspace.history.push(structuredClone(review));
    const remaining = state.reviews.filter(item => item.run_id !== getActiveRun().run_id || item.sample_id !== sample.sample_id);
    if (!storageAdapter.write(STORAGE_KEYS.reviews, remaining)) { toast('重判未生效：本地存储失败。'); return; }
    state.reviews = remaining;
    Object.assign(getDraft(), { scores: {}, saved: false, revealed: false, eligible: false, exposed: true, elapsedMs: 0 });
    saveWorkspace(); persistStatistics(); persistDraft(); renderReview(); updateBadges(); toast('原始初判已留档；重判不再计入独立盲判一致率。');
  }

  function addDefect() {
    const draft = getDraft();
    if (!draft.note.trim()) { toast('请先填写一句话缺陷说明。'); return; }
    draft.defects.push({ code: draft.code, position: draft.position, severity: draft.severity, note: draft.note.trim(), source: 'human', confirmed: true, marker: draft.marker ? { ...draft.marker } : null });
    persistDraft(); renderReview(); toast('已添加人工确认的缺陷。');
  }

  function normalizePeDraft(stored) {
    const defaults = { raw: PE_EXAMPLES[0], result: null, version: 'pe-v2.0', category: 'auto', lastContext: null, resultSnapshot: null, session: { history: [] }, detailOpen: false };
    if (!stored) return defaults;
    return { ...defaults, ...stored, session: { history: [], ...stored.session } };
  }

  function legacyExpand(raw, version) {
    const result = Object.fromEntries(Object.keys(PE_FIELDS).map(key => [key, '待补充']));
    if (version === 'pe-v1.0') return { ...result, subject: raw.trim() || '待补充' };
    const groups = collectPromptFields(raw);
    Object.keys(result).forEach(key => { if (groups[key].length) result[key] = [...new Set(groups[key])].join('；'); });
    if (version === 'pe-v1.2') {
      if (result.subject !== '待补充') result.subject += '；保留原指令明确的商品身份';
      result.structure += '；不得擅自增减已明确的结构件，未明确数量需确认';
      if (result.composition !== '待补充') result.composition += '；保留明确画幅、视角和主体占比';
    }
    return result;
  }

  function expandPrompt(raw) {
    if (state.pe.version !== 'pe-v2.0') { state.pe.lastContext = null; return legacyExpand(raw, state.pe.version); }
    const context = window.PE_ENGINE.run(raw, { category: state.pe.category, session: { history: [] } });
    state.pe.lastContext = context;
    return { ...context.result.segments };
  }

  function isPeResultStale() {
    const snapshot = state.pe.resultSnapshot;
    return Boolean(state.pe.result && (!snapshot || snapshot.raw !== state.pe.raw.trim() || snapshot.category !== state.pe.category || snapshot.version !== state.pe.version));
  }

  function savePeDraft() {
    if (storageAdapter.write(STORAGE_KEYS.pe, state.pe)) return true;
    toast('这次转写未能保存到浏览器，请复制结果后再离开。');
    return false;
  }

  function runPeRewrite() {
    const raw = state.pe.raw.trim();
    if (!raw) { toast('请先填写商品和你想要的画面。'); return; }
    state.pe.result = expandPrompt(raw);
    state.pe.resultVersion = state.pe.version;
    state.pe.resultSnapshot = { raw, category: state.pe.category, version: state.pe.version };
    state.pe.session.history = [];
    state.pe.detailOpen = false;
    if (state.pe.lastContext) recordUnknownPeTerms(state.pe.lastContext.unknown);
    savePeDraft(); renderPe();
  }

  function recordUnknownPeTerms(unknown) {
    [...new Set(unknown)].forEach(word => { state.peUnknown[word] = (Object.hasOwn(state.peUnknown, word) ? Number(state.peUnknown[word]) : 0) + 1; });
    if (!storageAdapter.write(STORAGE_KEYS.peUnknown, state.peUnknown)) toast('未识别说法的次数未能保存，本次结果仍可查看。');
  }

  function requireCurrentPeResult() {
    if (!state.pe.result) { toast('请先完成一次转写。'); return false; }
    if (isPeResultStale()) { toast('输入、品类或版本已变化，请重新转写后再使用结果。'); return false; }
    return true;
  }

  function getPeOutputText() {
    return state.pe.lastContext ? window.PE_ENGINE.serialize(state.pe.lastContext) : formatPeSections(state.pe.result);
  }

  function formatPeSections(sections) {
    return Object.entries(PE_FIELDS).map(([key, label]) => `${label}：${sections[key]}`).join('\n');
  }

  function renderPe() {
    document.querySelector('#page-pe').innerHTML = heading({ eyebrow: 'PE / 生产提效', title: '把口语要求，转成可以核对的出图指令', description: '本地六步规则转写。明确要求优先，规则建议和商品事实分开显示。' }) +
      `<div class="pe-layout">${renderPeInput()}<article class="card" id="pe-result-card">${renderPeOutput()}</article></div>` +
      renderPeMapping() + renderPeVersions() + renderPeExperiments() + renderPeUnknown();
  }

  function renderPeInput() {
    const categories = Object.keys(window.PE_RULES.completion);
    return `<article class="card"><div class="card-heading"><h2>用户原始指令</h2><span class="pill gray">原话</span></div><label class="field-label" for="pe-input">你希望生成怎样的商品图？</label><textarea id="pe-input" rows="6" placeholder="例如：来个蒸锅图，高级一点的">${escapeHtml(state.pe.raw)}</textarea><div class="example-list">${PE_EXAMPLES.map((example, index) => `<button class="example-button" data-action="pe-example" data-index="${index}">${escapeHtml(example)}</button>`).join('')}</div><label class="field pe-category">商品品类<select id="pe-category"><option value="auto" ${state.pe.category === 'auto' ? 'selected' : ''}>按原话识别</option>${categories.map(category => `<option value="${escapeHtml(category)}" ${state.pe.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></label><button class="button primary" data-action="expand">转写为六段结构 →</button><p class="muted">品类用于补充拍摄建议，不会凭空添加商品层数、材质和按键数量。选中的版本：${escapeHtml(state.pe.version)}。</p></article>`;
  }

  function renderPeOutput() {
    const context = state.pe.lastContext;
    const stale = isPeResultStale();
    const title = `<div class="card-heading"><div><h2>结构化转写结果</h2><p class="card-subtitle">${state.pe.result ? `结果版本 ${escapeHtml(state.pe.resultVersion || '旧版记录')}${context ? ` · 规则 ${escapeHtml(context.rulesVersion)}` : ''}` : '先填写商品和画面要求，再点击转写'}</p></div><span class="pill blue">结果</span></div>`;
    if (!state.pe.result) return title + '<p class="empty-state">这里会展示人话摘要、六段指令和需要你确认的内容。</p>';
    const summary = context ? window.PE_ENGINE.summary(context) : '历史版本结果，展开查看六段原文。';
    return title + `${stale ? '<p class="notice pe-stale" role="status">输入、品类或版本已变更；旧结果仍保留，重新转写后才可复制、调整和保存实验。</p>' : ''}<div class="pe-summary"><p class="pe-summary-text" id="pe-summary-text">我这样理解的：${escapeHtml(summary)}</p></div><div id="pe-metadata">${renderPeMetadata()}</div>${renderPeSections(stale)}${renderPeConstraints()}${renderPeRefinements(stale)}<div class="pe-output-actions"><button class="button primary" data-action="copy-pe" ${stale ? 'disabled' : ''}>复制完整提示词</button><span class="muted">包含六段、系统约束和独立的负面提示。</span></div>`;
  }

  function renderPeSections(stale) {
    return `<details class="pe-details" id="pe-detail" ${state.pe.detailOpen ? 'open' : ''}><summary>查看和编辑完整六段</summary><p class="muted">手改内容会保留；后续纠偏若涉及手改段，会提示你核对。</p><div class="pe-sections">${Object.entries(PE_FIELDS).map(([key, label], index) => `<div class="pe-section"><h3><span class="dimension-code">0${index + 1}</span> ${label}${state.pe.lastContext?.manualFields?.[key] ? '<span class="pill gray">已手改</span>' : ''}</h3><div class="editable" contenteditable="${stale ? 'false' : 'plaintext-only'}" role="textbox" aria-multiline="true" aria-label="${label}转写结果" data-pe-field="${key}">${escapeHtml(state.pe.result[key])}</div></div>`).join('')}</div></details>`;
  }

  function renderPeMetadata() {
    return renderPeConfidence() + renderPeChecks() + renderPeTrace();
  }

  function renderPeConfidence() {
    const context = state.pe.lastContext;
    if (!context) return '';
    const score = context.confidence;
    const level = score >= 0.75 ? '充分' : score >= 0.5 ? '需要核对' : '需要补充';
    const tone = score >= 0.75 ? 'green' : score >= 0.5 ? 'amber' : 'red';
    return `<div class="pe-confidence ${score < 0.5 ? 'danger' : score < 0.75 ? 'warn' : ''}"><span class="pill ${tone}">输入信息${level} · ${Math.round(score * 100)}%</span><p class="muted">这是按规则估算的信息充分度，不是理解准确率，也不代表出图成功率。</p>${score < 0.75 ? `<p>${context.reasons.map(escapeHtml).join('；') || '请核对规则补充的场景和风格。'}</p>` : ''}${score < 0.5 ? '<div class="pe-refine-group"><button class="button secondary small" data-action="pe-focus-input">补充商品名称</button><button class="button secondary small" data-action="pe-focus-category">确认商品品类</button><button class="button secondary small" data-action="pe-show-detail">查看待确认草稿</button></div>' : ''}</div>`;
  }

  function renderPeConstraints() {
    const context = state.pe.lastContext;
    if (!context) return '';
    return `<div class="pe-constraints"><h3>系统约束</h3><p id="pe-constraints-text">${escapeHtml(context.result.constraints || '没有额外约束')}</p><h3>负面提示</h3><p class="muted">如出图工具提供负面提示输入框，请将下面这一段填入对应位置。</p><p class="pe-negatives" id="pe-negatives-text">${context.result.negatives.map(escapeHtml).join(', ') || '没有额外负面提示'}</p></div>`;
  }

  function renderPeRefinements(stale) {
    if (!state.pe.lastContext) return '';
    return `<div class="pe-refine-group" role="group" aria-label="按上一轮结果继续调整">${PE_REFINEMENTS.map(item => `<button class="button secondary small pe-refine-button" data-action="refine-pe" data-key="${item.key}" ${stale ? 'disabled' : ''}>${item.label}</button>`).join('')}<button class="button ghost small" data-action="undo-pe" ${stale || !state.pe.session.history.length ? 'disabled' : ''}>撤销上次纠偏</button></div><p class="muted">亮度每次相对调整 10%；主体占比每次调整 10 个百分点。这是在修改提示词，不会直接改变已有图片。</p>`;
  }

  function renderPeTrace() {
    const context = state.pe.lastContext;
    if (!context) return '';
    const sources = Object.entries(context.sources || {});
    return `<details class="pe-trace"><summary>查看识别过程和内容来源</summary><ul>${context.fragments.map(fragment => `<li><strong>${escapeHtml(PE_SOURCE_LABELS[fragment.type] || '规则处理')}</strong>：${escapeHtml(fragment.hit || '默认补充')} → ${escapeHtml(fragment.applied)}</li>`).join('')}</ul>${sources.length ? `<h3>参数从哪里来</h3><ul>${sources.map(([path, source]) => `<li>${escapeHtml(labelPeParameter(path))}：${escapeHtml(PE_SOURCE_LABELS[source.source] || '规则建议')}${source.hit ? `（${escapeHtml(source.hit)}）` : ''}</li>`).join('')}</ul>` : ''}${context.dropped.length ? `<h3>冲突处理</h3><ul>${context.dropped.map(item => `<li>${escapeHtml(item.name)} 与 ${escapeHtml(item.kept)} 冲突，未自动合用，请核对。</li>`).join('')}</ul>` : ''}${context.unknown.length ? `<p class="notice compact">尚未识别的说法：${context.unknown.map(escapeHtml).join('；')}。保留原话，请补充具体视觉要求。</p>` : ''}</details>`;
  }

  function labelPeParameter(path) {
    const labels = { light: '光照', composition: '构图', color: '色彩', material: '材质', direction: '方向', softness: '柔硬', kelvin: '色温', contrast: '对比度', brightness: '亮度', subject_ratio: '主体占比', ratio: '画幅', angle: '视角', whitespace: '留白', saturation: '饱和度', tone: '色调', max_colors: '主要色彩数量', finish: '表面处理', props_count: '道具数量', environment: '环境', subject: '主体', structure: '结构' };
    return path.split('.').map(part => labels[part] || '其他要求').join(' / ');
  }

  function renderPeMapping() {
    return `<article class="card"><div class="card-heading"><div><h2>模糊词映射表</h2><p class="card-subtitle">页面与引擎使用同一份规则，明确要求优先于这些建议</p></div><label class="search-label"><span class="sr-only">搜索模糊词映射</span><input class="search-input" id="fuzzy-search" type="search" placeholder="搜索模糊词或具体描述" value="${escapeHtml(state.filter)}"></label></div><div class="table-wrap"><table class="data-table"><thead><tr><th>用户说</th><th>理解方向</th><th>规则建议</th></tr></thead><tbody id="fuzzy-body">${renderFuzzyRows()}</tbody></table></div></article>`;
  }

  function renderFuzzyRows() {
    const rules = [...window.PE_RULES.fuzzy.subjective, ...window.PE_RULES.fuzzy.relative];
    const matches = rules.filter(item => `${item.triggers.join(' ')} ${item.fragment}`.toLowerCase().includes(state.filter.toLowerCase()));
    return matches.length ? matches.map(item => `<tr><td><span class="fuzzy-term">${escapeHtml(item.triggers.join(' / '))}</span></td><td>${escapeHtml(item.means || item.meaning || '转成可核对的视觉条件')}</td><td>${escapeHtml(item.fragment)}</td></tr>`).join('') : '<tr><td colspan="3" class="empty-state">没有找到匹配的模糊词，请换个关键词。</td></tr>';
  }

  function renderPeVersions() {
    return `<article class="card"><div class="card-heading"><div><h2>PE 版本记录</h2><p class="card-subtitle">旧版本保留原规则；切换版本后需重新转写</p></div></div><div class="version-list">${PE_VERSIONS.map(version => `<button class="version-button ${state.pe.version === version.version ? 'active' : ''}" data-action="pe-version" data-version="${escapeHtml(version.version)}" aria-pressed="${state.pe.version === version.version}"><strong class="mono">${escapeHtml(version.version)}</strong><span>${escapeHtml(version.date)}</span><span>${escapeHtml(version.change)}</span><small>${version.usable_rate == null ? '可用率：待实际评测' : `演示可用率 ${percent(version.usable_rate)}`}</small></button>`).join('')}</div><div class="version-diff">${renderVersionDiff()}</div></article>`;
  }

  function renderVersionDiff() {
    const index = PE_VERSIONS.findIndex(version => version.version === state.pe.version);
    const current = PE_VERSIONS[index];
    const previous = PE_VERSIONS[index - 1];
    return `<h3>${escapeHtml(current.version)}${previous ? ` 对比 ${escapeHtml(previous.version)}` : ' · 基线模板'}</h3><p>${escapeHtml(current.change)}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>模板段落</th>${previous ? `<th>${escapeHtml(previous.version)}</th>` : ''}<th>${escapeHtml(current.version)}</th></tr></thead><tbody>${Object.entries(PE_FIELDS).map(([key, label]) => `<tr><th>${label}</th>${previous ? `<td>${escapeHtml(previous.template[key])}</td>` : ''}<td class="${previous && previous.template[key] !== current.template[key] ? 'diff-changed' : ''}">${escapeHtml(current.template[key])}</td></tr>`).join('')}</tbody></table></div><p class="muted">保真约束 / 负面提示：${escapeHtml(current.constraints)}</p><p class="muted">此处对比规则设计，实际效果以转写实验的同条件复核为准。</p>`;
  }

  function renderPeUnknown() {
    const entries = Object.entries(state.peUnknown).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-CN'));
    return `<article class="card"><details class="pe-unknown-list"><summary>未识别说法（${entries.length}）</summary><p class="muted">仅统计这台浏览器中点击转写时未覆盖的说法；刷新和纠偏不会重复计数，可作为补库线索。</p>${entries.length ? `<ul>${entries.map(([word, count]) => `<li><span>${escapeHtml(word)}</span><span class="pill gray">${Number(count)} 次</span></li>`).join('')}</ul>` : '<p class="empty-state">还没有未识别说法。</p>'}</details></article>`;
  }

  function refreshPeOutput() {
    const detail = document.querySelector('#pe-detail');
    if (detail) state.pe.detailOpen = detail.open;
    document.querySelector('#pe-result-card').innerHTML = renderPeOutput();
    const saveButton = document.querySelector('[data-action="save-pe-experiment"]');
    if (saveButton) saveButton.disabled = !state.pe.result || isPeResultStale();
  }

  function refinePeResult(key) {
    if (!requireCurrentPeResult() || !state.pe.lastContext) return;
    state.pe.detailOpen = document.querySelector('#pe-detail')?.open || false;
    const previous = state.pe.lastContext;
    state.pe.lastContext = window.PE_ENGINE.refine(previous, key);
    const changed = state.pe.lastContext.result.prompt !== previous.result.prompt;
    if (changed) state.pe.session.history = [...state.pe.session.history, structuredClone(previous)].slice(-PE_HISTORY_LIMIT);
    state.pe.result = { ...state.pe.lastContext.result.segments };
    savePeDraft(); renderPe(); toast(changed ? '已按上一轮参数调整，手改段继续保留，请核对摘要。' : '结果未发生变化，请查看核对提醒或直接编辑对应段。');
  }

  function undoPeRefinement() {
    if (!requireCurrentPeResult() || !state.pe.session.history.length) return;
    const manualFields = { ...state.pe.lastContext.manualFields };
    state.pe.lastContext = state.pe.session.history.pop();
    Object.entries(manualFields).forEach(([field, text]) => { state.pe.lastContext = window.PE_ENGINE.edit(state.pe.lastContext, field, text); });
    state.pe.result = { ...state.pe.lastContext.result.segments };
    savePeDraft(); renderPe(); toast('已撤销上次纠偏，之后手动修改的内容继续保留。');
  }

  function editPeSection(target) {
    if (!requireCurrentPeResult()) return;
    if (state.pe.lastContext) {
      state.pe.lastContext = window.PE_ENGINE.edit(state.pe.lastContext, target.dataset.peField, target.textContent);
      state.pe.result = { ...state.pe.lastContext.result.segments };
      document.querySelector('#pe-summary-text').textContent = `我这样理解的：${window.PE_ENGINE.summary(state.pe.lastContext)}`;
      document.querySelector('#pe-metadata').innerHTML = renderPeMetadata();
      document.querySelector('#pe-constraints-text').textContent = state.pe.lastContext.result.constraints;
      document.querySelector('#pe-negatives-text').textContent = state.pe.lastContext.result.negatives.join(', ');
      const heading = target.closest('.pe-section').querySelector('h3');
      if (!heading.querySelector('.pill')) heading.insertAdjacentHTML('beforeend', '<span class="pill gray">已手改</span>');
    } else {
      state.pe.result[target.dataset.peField] = target.textContent;
      const checks = document.querySelector('.pe-checks');
      if (checks) checks.outerHTML = renderPeChecks();
    }
    savePeDraft();
  }

  async function copyPePrompt() {
    if (!requireCurrentPeResult()) return;
    const prompt = getPeOutputText();
    try {
      if (!navigator.clipboard?.writeText) { showPeCopyFallback(prompt); return; }
      await navigator.clipboard.writeText(prompt);
      toast('已复制六段、系统约束和负面提示，请按出图工具的输入框分别使用。');
    } catch (error) { showPeCopyFallback(prompt); }
  }

  function showPeCopyFallback(prompt) {
    document.querySelector('#task-dialog-content').innerHTML = `<h2>请手动复制完整提示词</h2><p>浏览器没有允许自动复制。下面已选中文本，可按 Ctrl+C 复制。</p><label class="field">完整提示词<textarea id="pe-copy-fallback" rows="14" readonly>${escapeHtml(prompt)}</textarea></label>`;
    document.querySelector('#task-dialog').showModal();
    document.querySelector('#pe-copy-fallback').select();
  }

  function getHeatmap() {
    const records = getReportRecords();
    const categories = [...new Set(getSamples().map(sample => sample.category)), '全部汇总'];
    return categories.map(category => {
      const selected = category === '全部汇总' ? records : records.filter(record => record.sample.category === category);
      return { category, sample_count: selected.length, cells: DEFECT_CODES.map(defect => {
        const defective = selected.filter(record => record.defects.some(item => item.code === defect.code)).length;
        return { code: defect.code, defective_samples: defective, total_samples: selected.length, rate: selected.length ? defective / selected.length : null, sample_ids: selected.filter(record => record.defects.some(item => item.code === defect.code)).map(record => record.sample.sample_id) };
      }) };
    });
  }

  function getReport() {
    const records = getReportRecords();
    return { type: 'local_evaluation', run: getActiveRun(), source: state.reportSource, total_samples: getSamples().length, included_samples: records.length,
      dimensions: getDimensionAverages(records), outcomes: getOutcomeCounts(records), heatmap: getHeatmap(), local_agreement: getStatistics(),
      reviews: getReviews(), adjudications: state.workspace.adjudications.filter(item => item.run_id === getActiveRun().run_id), comparison: getRunComparisons(),
      relative_change_formula: '(current - previous) / previous; previous = 0 时不计算', cases: state.workspace.cases.filter(item => item.run_id === getActiveRun().run_id), efficiency: state.workspace.efficiency[getActiveRun().run_id] || null };
  }

  function renderReport() {
    const report = getReport();
    const records = getReportRecords();
    const tabs = { human: '人工初判', final: '最终确认', machine: '机器初评' };
    const averages = report.dimensions;
    document.querySelector('#page-report').innerHTML = heading({ eyebrow: 'EVALUATION REPORT / 评测报告', title: '每个结论，都能找到它的样本', description: '切换机器初评、人工初判与最终确认口径；没有人审的样本不会补成满分。', actions: '<button class="button primary" data-action="export">导出报告 JSON</button>' }) + renderRunSummary() + `<div class="source-tabs">${Object.entries(tabs).map(([source, label]) => `<button class="source-tab ${state.reportSource === source ? 'active' : ''}" data-action="report-source" data-source="${source}">${label}</button>`).join('')}</div><div class="notice">当前口径：${tabs[state.reportSource]}，包含 ${records.length}/${getSamples().length} 条。${state.reportSource === 'final' ? '分歧未裁决、暂缓放行的记录不当作最终通过。' : state.reportSource === 'human' ? '这里展示人审初判，不代表分歧已解决。' : '机器结果可能有误，执行失败按缺结果展示。'} 缺陷率同时标出条数与分母。</div>
      <div class="kpi-grid">${metricCard('可用', report.outcomes.usable, records.length ? percent(report.outcomes.usable / records.length) : '暂无结果', 'green')}${metricCard('需修', report.outcomes.repair, records.length ? percent(report.outcomes.repair / records.length) : '暂无结果', 'amber')}${metricCard('不可用', report.outcomes.discard, '不能被高平均分掩盖', 'red')}${metricCard('暂缓 / 缺结果', report.outcomes.blocked + report.outcomes.pending, '先处理阻断，再决定是否放行', 'amber')}</div>
      <article class="card"><div class="card-heading"><h2>当前批次八维得分</h2><span class="pill gray">${tabs[state.reportSource]}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>维度</th><th>权重</th><th>平均分 / 2</th><th>适用样本数</th></tr></thead><tbody>${DIMENSIONS.map(dimension => `<tr><td>${dimension.code} ${dimension.name}</td><td>${dimension.weight}%</td><td>${averages[dimension.code].score === null ? '—' : averages[dimension.code].score.toFixed(2)}</td><td>${averages[dimension.code].count}</td></tr>`).join('')}</tbody></table></div></article>${renderComparison()}
      <article class="card"><div class="card-heading"><h2>缺陷率热力图 · 全部编码</h2><span class="pill amber">含合规与阻断问题</span></div><div class="table-wrap"><table class="data-table heatmap"><thead><tr><th>品类 / 样本数</th>${DEFECT_CODES.map(defect => `<th>${defect.code}<small>${defect.name}</small></th>`).join('')}</tr></thead><tbody>${report.heatmap.map(row => `<tr><th>${escapeHtml(row.category)}<small>n=${row.sample_count}</small></th>${row.cells.map(cell => `<td><button class="heat-cell report-drillbutton" data-level="${cell.rate == null || cell.rate === 0 ? 0 : Math.min(4, Math.ceil(cell.rate * 4))}" data-action="drill-defect" data-category="${escapeHtml(row.category)}" data-code="${cell.code}" ${cell.defective_samples ? '' : 'disabled'}>${cell.rate === null ? '—' : percent(cell.rate)}<small>${cell.defective_samples}/${cell.total_samples}</small></button></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted">分母为该口径下该品类的已纳入样本。每个样本的同一编码只计一次。这里衡量场景发生率；不等于只在该子项适用样本中的错误率。</p></article><article class="card"><h2>逐条结果与证据</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>样本</th><th>结论</th><th>依据 / 状态</th><th>操作</th></tr></thead><tbody>${records.length ? records.map(record => `<tr><td class="mono">${escapeHtml(record.sample.sample_id)}</td><td>${statusPill(record.outcome.status, record.outcome.label)}</td><td>${record.outcome.reasons.map(escapeHtml).join('；')}${record.review && needsAdjudication(record.review) ? ' · 初判存在分歧，待裁决' : ''}</td><td><button class="button ghost small" data-action="jump-id" data-id="${escapeHtml(record.sample.sample_id)}">查看样本</button></td></tr>`).join('') : '<tr><td colspan="4" class="empty-state">当前口径暂无记录。保存评分或完成裁决后，这里会自动更新。</td></tr>'}</tbody></table></div></article>${renderReliability()}${renderEfficiency()}<div id="export-feedback" class="notice" hidden></div>`;
  }

  function renderCharts() {
    state.charts.forEach(chart => chart.destroy()); state.charts = [];
    if (typeof Chart === 'undefined') { renderOfflineCharts(); return; }
    const dark = document.documentElement.dataset.theme === 'dark';
    const text = dark ? '#C7D2DF' : '#616161';
    const grid = dark ? '#354357' : '#E9EDF2';
    const current = VERSION_STATS[VERSION_STATS.length - 1];
    const previous = VERSION_STATS[VERSION_STATS.length - 2];
    const radar = new Chart(document.querySelector('#radar-chart'), { type: 'radar', data: { labels: DIMENSIONS.map(dimension => [dimension.code, dimension.short_name]), datasets: [
      { label: current.version, data: DIMENSIONS.map(dimension => current.scores[dimension.code]), borderColor: '#1565C0', backgroundColor: '#1565C018', pointBackgroundColor: '#1565C0', borderWidth: 2, pointRadius: 3 },
      { label: previous.version, data: DIMENSIONS.map(dimension => previous.scores[dimension.code]), borderColor: '#91A4BC', backgroundColor: 'transparent', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 2 }
    ] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom', labels: { color: text, boxWidth: 12, font: { size: 11 } } } }, scales: { r: { min: 0, max: 2, ticks: { stepSize: 0.5, color: text, backdropColor: 'transparent', font: { size: 10 } }, grid: { color: grid }, angleLines: { color: grid }, pointLabels: { color: text, font: { size: 11 } } } } } });
    const trend = new Chart(document.querySelector('#trend-chart'), { type: 'line', data: { labels: VERSION_STATS.map(version => version.version), datasets: [{ label: '可用率', data: VERSION_STATS.map(version => version.usable_rate * 100), borderColor: '#1565C0', backgroundColor: '#1565C00C', borderWidth: 2.5, fill: true, tension: 0.25, pointBackgroundColor: '#FFFFFF', pointBorderWidth: 2.5, pointRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, layout: { padding: { top: 20, right: 18 } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => `可用率 ${context.raw}%` } } }, scales: { x: { grid: { display: false }, ticks: { color: text }, border: { display: false } }, y: { min: 0, max: 100, ticks: { stepSize: 25, color: text, callback: value => `${value}%` }, grid: { color: grid }, border: { display: false } } } } });
    state.charts = [radar, trend];
  }

  function renderOfflineCharts() {
    const latest = VERSION_STATS[VERSION_STATS.length - 1];
    const point = (index, radius) => { const angle = index * Math.PI / 4 - Math.PI / 2; return [200 + Math.cos(angle) * radius, 135 + Math.sin(angle) * radius]; };
    const polygon = ratio => DIMENSIONS.map((dimension, index) => point(index, typeof ratio === 'number' ? ratio * 90 : latest.scores[dimension.code] / 2 * 90).join(',')).join(' ');
    document.querySelector('#radar-wrap').innerHTML = `<svg viewBox="0 0 400 280" role="img" aria-label="离线八维雷达图">${[0.25, 0.5, 0.75, 1].map(ratio => `<polygon points="${polygon(ratio)}" fill="none" stroke="var(--border, #D8DEE6)"/>`).join('')}<polygon points="${polygon(null)}" fill="#1565C018" stroke="#1565C0" stroke-width="2"/>${DIMENSIONS.map((dimension, index) => { const [x, y] = point(index, 116); return `<text x="${x}" y="${y}" text-anchor="middle" fill="currentColor" font-size="10">${dimension.code} ${dimension.short_name}</text>`; }).join('')}<text x="200" y="275" text-anchor="middle" fill="currentColor" font-size="10">离线图表 · ${latest.version} · 0–2 分</text></svg>`;
    const coordinates = VERSION_STATS.map((version, index) => `${55 + index * 140},${225 - version.usable_rate * 180}`);
    document.querySelector('#trend-wrap').innerHTML = `<svg viewBox="0 0 400 280" role="img" aria-label="离线可用率趋势图">${[0, 25, 50, 75, 100].map(value => `<path d="M40 ${225 - value * 1.8}H370" stroke="var(--border, #D8DEE6)"/><text x="34" y="${229 - value * 1.8}" text-anchor="end" fill="currentColor" font-size="10">${value}%</text>`).join('')}<polyline points="${coordinates.join(' ')}" fill="none" stroke="#1565C0" stroke-width="2.5"/>${VERSION_STATS.map((version, index) => `<circle cx="${55 + index * 140}" cy="${225 - version.usable_rate * 180}" r="4" fill="#1565C0"/><text x="${55 + index * 140}" y="${211 - version.usable_rate * 180}" text-anchor="middle" fill="currentColor" font-size="12">${percent(version.usable_rate)}</text><text x="${55 + index * 140}" y="250" text-anchor="middle" fill="currentColor" font-size="11">${version.version}</text>`).join('')}<text x="200" y="275" text-anchor="middle" fill="currentColor" font-size="10">离线图表 · Chart.js CDN 未加载</text></svg>`;
  }

  function renderRoute() {
    const requested = location.hash.slice(2).split('?')[0];
    const route = Object.hasOwn(ROUTE_NAMES, requested) ? requested : 'dashboard';
    if (route !== requested) { location.replace('#/dashboard'); return; }
    if (state.route !== route) pauseTimer();
    state.route = route;
    state.charts.forEach(chart => chart.destroy()); state.charts = [];
    document.querySelectorAll('[data-page]').forEach(page => { page.hidden = page.dataset.page !== route; });
    document.querySelectorAll('[data-route]').forEach(link => { link.classList.toggle('active', link.dataset.route === route); if (link.dataset.route === route) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
    document.querySelector('#breadcrumb-title').textContent = ROUTE_NAMES[route];
    document.querySelector('#workspace-area').textContent = route === 'pe' ? '生产提效' : '评测工作台';
    document.title = `${ROUTE_NAMES[route]} · 评测工作台`;
    ({ dashboard: renderDashboard, setup: renderSetup, task: renderTasks, review: renderReview, calibration: renderCalibration, report: renderReport, cases: renderCases, pe: renderPe })[route]();
    if (route === 'setup' && state.pendingImportErrors) { const errors = state.pendingImportErrors; state.pendingImportErrors = null; showImportErrors(errors); }
    if (route === 'dashboard' && document.querySelector('#radar-chart')) renderCharts();
    updateBadges();
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme; storageAdapter.write(STORAGE_KEYS.theme, theme);
    const label = theme === 'dark' ? '切换浅色模式' : '切换深色模式';
    document.querySelector('#theme-toggle').setAttribute('aria-label', label); document.querySelector('#theme-toggle').title = label;
    if (state.route === 'dashboard') { state.charts.forEach(chart => chart.destroy()); state.charts = []; renderDashboard(); if (document.querySelector('#radar-chart')) renderCharts(); }
  }

  function handleAction(button) {
    const actions = {
      'reset-queue': () => { state.queue = { category: '', status: 'all', search: '' }; renderReview(); },
      score: () => setScore(button), reveal: revealScores, save: saveReview, previous: () => moveSample(-1), next: () => moveSample(1), rejudge: rejudgeSample, timer: toggleTimer,
      position: () => { getDraft().position = button.dataset.value; persistDraft(); renderReview(); }, severity: () => { getDraft().severity = button.dataset.value; persistDraft(); renderReview(); },
      'remove-defect': () => { getDraft().defects.splice(Number(button.dataset.index), 1); persistDraft(); renderReview(); }, 'add-defect': addDefect,
      standard: () => showStandard(button.dataset.code), 'jump-id': () => jumpToSample(button.dataset.id), 'select-run': () => selectRun(button.dataset.id),
      'select-calibration': () => { state.selectedCalibration = button.dataset.id; renderCalibration(); },
      'report-source': () => { state.reportSource = button.dataset.source; renderReport(); }, 'drill-defect': () => drillDefect(button),
      'drill-jump': () => { document.querySelector('#task-dialog').close(); jumpToSample(button.dataset.id); },
      'import-dataset': () => document.querySelector('#dataset-import').click(), 'download-template': downloadTemplate,
      'upload-image': () => requestImageUpload(button.dataset.kind), 'zoom-image': () => zoomImage(button.dataset.key),
      'pe-example': () => { state.pe.raw = PE_EXAMPLES[Number(button.dataset.index)]; savePeDraft(); renderPe(); },
      expand: runPeRewrite,
      'pe-version': () => { state.pe.version = button.dataset.version; savePeDraft(); renderPe(); },
      'copy-pe': copyPePrompt, 'refine-pe': () => refinePeResult(button.dataset.key), 'undo-pe': undoPeRefinement,
      'pe-focus-input': () => document.querySelector('#pe-input').focus(),
      'pe-focus-category': () => document.querySelector('#pe-category').focus(),
      'pe-show-detail': () => { document.querySelector('#pe-detail').open = true; document.querySelector('#pe-detail').scrollIntoView({ block: 'nearest' }); },
      'save-pe-experiment': savePeExperiment,
      export: () => { const report = getReport(); reportExporter.write(report); downloadJson(`evaluation-${getActiveRun().run_id}.json`, report); const feedback = document.querySelector('#export-feedback'); feedback.hidden = false; feedback.textContent = '已下载当前口径的报告 JSON，控制台同时输出。'; toast('报告已导出。'); }
    };
    if (actions[button.dataset.action]) actions[button.dataset.action]();
  }

  function bindEvents() {
    document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); document.querySelector('#main-content').focus(); });
    document.addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button && !button.disabled) handleAction(button); else markImage(event); });
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    document.addEventListener('submit', event => {
      if (event.target.closest('dialog') && event.target.method === 'dialog') return;
      event.preventDefault();
      const forms = { 'rules-form': saveRules, 'standards-form': saveStandards, 'adjudication-form': submitAdjudication, 'case-form': submitCase, 'efficiency-form': saveEfficiency };
      if (forms[event.target.id]) forms[event.target.id](event.target);
      if (event.target.classList.contains('case-update-form')) updateCase(event.target);
      if (event.target.classList.contains('experiment-form')) linkExperiment(event.target);
    });
    document.querySelector('#theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    window.addEventListener('hashchange', renderRoute);
    document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseTimer(); if (state.route === 'review') renderReview(); } });
    window.addEventListener('beforeunload', pauseTimer);
  }

  function getActiveRun() { return state.workspace.runs.find(run => run.run_id === state.workspace.activeRunId) || state.workspace.runs[0]; }
  function getSamplesForRun(runId) { return state.workspace.imports[runId] || (runId === RUN_METADATA[0].run_id ? SAMPLES : []); }

  function getSamples() { return getSamplesForRun(getActiveRun().run_id); }

  function getReviewKey(sampleId) { return `${getActiveRun().run_id}:${sampleId}`; }

  function getReviews() { return state.reviews.filter(review => review.run_id === getActiveRun().run_id); }

  function findReview(sampleId) { return getReviews().find(review => review.sample_id === sampleId); }

  function saveWorkspace() { return storageAdapter.write(STORAGE_KEYS.workspace, state.workspace); }

  function formatDate(value) { return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); }

  function getStandards() { return getActiveRun().standards || state.workspace.standards; }

  function getStatisticRows() { return getReviews().filter(review => review.agreement); }

  function getAdjudication(review) {
    return state.workspace.adjudications.filter(item => item.run_id === review.run_id && item.sample_id === review.sample_id && item.review_revision === review.revision).at(-1);
  }

  function getOutcome(sample, evaluation = {}) {
    return calculateOutcome({ sample, scores: evaluation.scores || {}, defects: evaluation.defects || [], rules: evaluation.rules || getActiveRun().rules, adjudication: evaluation.adjudication || null });
  }

  function needsAdjudication(review) {
    const sample = getSamplesForRun(review.run_id).find(item => item.sample_id === review.sample_id);
    if (!sample) return false;
    const adjudication = getAdjudication(review);
    if (adjudication) return adjudication.decision === 'blocked';
    return getOutcome(sample, { scores: review.human_scores, defects: review.defects, rules: review.rules_snapshot }).status === 'blocked' ||
      sample.applicable_dims.some(code => Number.isInteger(sample.machine_scores[code]) && sample.machine_scores[code] !== review.human_scores[code]) ||
      sample.machine_status && sample.machine_status !== 'complete';
  }

  function statusPill(status, label) {
    const tones = { usable: 'green', repair: 'amber', discard: 'gray', blocked: 'amber', pending: 'gray', open: 'blue', doing: 'blue', verify: 'amber', done: 'green' };
    return `<span class="pill ${tones[status] || 'gray'}">${escapeHtml(label || ({ usable: '可用', repair: '需修', discard: '不可用', blocked: '待裁决', pending: '待评分', open: '待处理', doing: '处理中', verify: '待回归', done: '已验证' }[status] || status))}</span>`;
  }

  function getReportRecords(source = state.reportSource) {
    return getSamples().flatMap(sample => {
      const review = findReview(sample.sample_id);
      const adjudication = review ? getAdjudication(review) : null;
      if (source === 'machine') return [{ sample, scores: sample.machine_scores, defects: sample.machine_defects, outcome: getOutcome(sample, { scores: sample.machine_scores, defects: sample.machine_defects }), review: null }];
      if (!review || source === 'final' && needsAdjudication(review)) return [];
      const scores = source === 'final' && adjudication ? adjudication.final_scores : review.human_scores;
      const defects = source === 'final' && adjudication ? adjudication.final_defects : review.defects;
      return [{ sample, scores, defects, outcome: getOutcome(sample, { scores, defects, rules: review.rules_snapshot, adjudication: source === 'final' ? adjudication : null }), review }];
    });
  }

  function getDimensionAverages(records) {
    return Object.fromEntries(DIMENSIONS.map(dimension => {
      const values = records.filter(record => record.sample.applicable_dims.includes(dimension.code) && Number.isInteger(record.scores[dimension.code])).map(record => record.scores[dimension.code]);
      return [dimension.code, { score: values.length ? values.reduce((total, score) => total + score, 0) / values.length : null, count: values.length }];
    }));
  }

  function getOutcomeCounts(records) {
    return records.reduce((counts, record) => ({ ...counts, [record.outcome.status]: (counts[record.outcome.status] || 0) + 1 }), { usable: 0, repair: 0, discard: 0, blocked: 0, pending: 0 });
  }

  function metricCard(label, value, detail, tone = '') { return `<article class="card kpi-card"><div class="kpi-label">${label}</div><div class="kpi-value ${tone}">${value}</div><div class="kpi-trend muted">${detail}</div></article>`; }

  function renderRunSummary() {
    const run = getActiveRun();
    return `<div class="run-summary"><strong>${escapeHtml(run.run_id)}</strong><span>模型 ${escapeHtml(run.model_version)}</span><span>评测集 ${escapeHtml(run.dataset_version)}</span><span>规则 ${escapeHtml(run.standard_version)}</span><span>PE ${escapeHtml(run.pe_version)}</span><span>抽样 ${escapeHtml(run.sampling_strategy)}</span></div>`;
  }

  function renderSetup() {
    const run = getActiveRun();
    const groups = [...new Set(getSamples().map(sample => sample.group_id || sample.sample_id))];
    const categories = [...new Set(getSamples().map(sample => sample.category))];
    document.querySelector('#page-setup').innerHTML = heading({ eyebrow: 'PREPARATION / 评测准备', title: '先把题目和判分规则说清楚', description: '导入已有评测结果即可开始；图片可在复核页逐条关联，保存在本机。', actions: '<button class="button primary" data-action="import-dataset">导入评测结果 JSON</button>' }) + renderRunSummary() +
      `<div class="section-grid"><article class="card"><div class="card-heading"><h2>评测集覆盖</h2><button class="button ghost small" data-action="download-template">下载导入模板</button></div><div class="metric-strip"><div>${getSamples().length}<small>张图片</small></div><div>${groups.length}<small>独立单品 / 组</small></div><div>${categories.length}<small>品类</small></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>品类</th><th>样本数</th><th>图型</th></tr></thead><tbody>${categories.map(category => `<tr><td>${escapeHtml(category)}</td><td>${getSamples().filter(sample => sample.category === category).length}</td><td>${[...new Set(getSamples().filter(sample => sample.category === category).map(sample => sample.image_type))].map(escapeHtml).join(' / ')}</td></tr>`).join('')}</tbody></table></div><p class="muted">同一蒸锅的四张图是一组，不能当作四个独立商品。随机抽检与专门找风险的样本应分批记录。</p></article><article class="card"><div class="card-heading"><h2>本轮可追溯条件</h2></div><p>本轮目标：${escapeHtml(run.purpose)}</p><p>随机种子：${escapeHtml(run.seed)}</p><p>生成参数：${escapeHtml(JSON.stringify(run.generation_params))}</p><p class="notice compact">导入文件需要记录运行编号、评测集、评分规则、PE 版本和抽样方式；历史快照没有逐条数据时，不伪造对比。</p><button class="button secondary" data-action="import-dataset">导入另一轮结果</button></article></div>
      <article class="card"><div class="card-heading"><div><h2>严重问题的阻断规则</h2><p class="muted">已确认口径：先暂缓放行，进入人工裁决，不直接废弃。</p></div></div><form id="rules-form"><label class="switch-control"><input type="checkbox" name="block_compliance_zero" ${getActiveRun().rules.block_compliance_zero ? 'checked' : ''}>合规 L8 为 0 分时阻断</label><label class="switch-control"><input type="checkbox" name="block_p0" ${getActiveRun().rules.block_p0 ? 'checked' : ''}>人工确认 P0 缺陷时阻断</label><div class="form-grid"><label class="field">规则版本<input name="standard_version" value="${escapeHtml(run.standard_version)}" required></label><label class="field">本轮验收目标<input name="purpose" value="${escapeHtml(run.purpose)}" required></label></div><button class="button primary" type="submit">保存本轮规则</button><p class="muted">本批保存初判后，标准与阻断规则冻结。修改口径请导入新批次，旧初判保留原规则快照。</p></form></article>
      <article class="card"><div class="card-heading"><div><h2>八维评分标准与边界例子</h2><p class="muted">以下是可编辑的演示标准，需用真实业务案例校准。具体维度可在评分时随时查看。</p></div></div><form id="standards-form"><div class="standard-grid">${getStandards().map(standard => `<details class="standard-card"><summary><strong>${standard.code} ${standard.name}</strong></summary><p>${standard.checks.map(escapeHtml).join('；')}</p>${[2, 1, 0].map(score => `<label class="field"><span>${score} 分 · ${SCORE_LABELS[score]}</span><textarea name="${standard.code}_${score}" rows="2" required>${escapeHtml(standard.anchors[score])}</textarea></label>`).join('')}<p class="muted">${escapeHtml(standard.applicability)}</p></details>`).join('')}</div><button class="button secondary" type="submit">保存标准说明</button></form></article><div class="notice" id="import-feedback" hidden></div>`;
  }

  function showStandard(code) {
    const standard = getStandards().find(item => item.code === code);
    document.querySelector('#task-dialog-content').innerHTML = `<h2>${standard.code} ${standard.name}</h2><ul>${standard.checks.map(check => `<li>${escapeHtml(check)}</li>`).join('')}</ul>${[2, 1, 0].map(score => `<p><strong>${score} ${SCORE_LABELS[score]}</strong>：${escapeHtml(standard.anchors[score])}</p>`).join('')}<p class="notice">${escapeHtml(standard.applicability)}<br>${escapeHtml(standard.blocking)}</p>`;
    document.querySelector('#task-dialog').showModal();
  }

  function getQueueIndices() {
    return getSamples().flatMap((sample, index) => {
      const review = findReview(sample.sample_id);
      const categoryMatches = !state.queue.category || sample.category === state.queue.category;
      const textMatches = `${sample.sample_id} ${sample.category}`.toLowerCase().includes(state.queue.search.toLowerCase());
      const matches = state.queue.status === 'all' || state.queue.status === 'pending' && !review || state.queue.status === 'reviewed' && review || state.queue.status === 'disagreement' && review && needsAdjudication(review) || state.queue.status === 'risk' && sample.machine_status && sample.machine_status !== 'complete';
      return categoryMatches && textMatches && matches ? [index] : [];
    });
  }

  function renderQueue() {
    const matches = getQueueIndices();
    return `<div class="card toolbar-filters"><label>品类<select id="queue-category"><option value="">全部品类</option>${[...new Set(getSamples().map(sample => sample.category))].map(category => `<option ${state.queue.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></label><label>复核队列<select id="queue-status">${Object.entries({ all: '全部样本', pending: '未评样本', reviewed: '已保存', disagreement: '待裁决 / 分歧', risk: '机器不确定 / 执行失败' }).map(([key, label]) => `<option value="${key}" ${state.queue.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>按编号查找<input id="queue-search" placeholder="输入样本编号" value="${escapeHtml(state.queue.search)}"></label><label>直接定位<select id="sample-jump"><option value="">找到 ${matches.length} 条，选择样本</option>${matches.map(index => `<option value="${index}">${escapeHtml(getSamples()[index].sample_id)}${findReview(getSamples()[index].sample_id) ? ' · 已评' : ' · 未评'}</option>`).join('')}</select></label></div>`;
  }

  function renderGroupGallery(sample) {
    if (!sample.group_id) return '';
    const group = getSamples().filter(item => item.group_id === sample.group_id);
    return `<article class="card"><div class="card-heading"><h2>同组图片对照 · ${escapeHtml(sample.group_id)}</h2><span class="muted">L6 需整组比较</span></div><div class="group-gallery">${group.map(item => { const key = `${getReviewKey(item.sample_id)}:generated`; return `<div class="group-thumb">${state.imageUrls[key] ? `<button class="button ghost" data-action="zoom-image" data-key="${escapeHtml(key)}"><img src="${state.imageUrls[key]}" alt="${escapeHtml(item.sample_id)}"></button>` : '<div class="empty-state">尚未关联图片</div>'}<button class="button ghost small" data-action="jump-id" data-id="${escapeHtml(item.sample_id)}">${escapeHtml(item.sample_id)}</button><small>${escapeHtml(item.image_type)}</small></div>`; }).join('')}</div></article>`;
  }

  function jumpToSample(sampleId) {
    const index = getSamples().findIndex(sample => sample.sample_id === sampleId);
    if (index < 0) return;
    pauseTimer(); persistDraft(); state.queue = { category: '', status: 'all', search: '' }; state.currentIndex = index;
    storageAdapter.write(STORAGE_KEYS.index, index);
    if (state.route === 'review') renderReview(); else location.hash = '#/review';
  }

  function selectRun(runId) {
    pauseTimer(); persistDraft();
    state.workspace.activeRunId = runId; state.currentIndex = 0; state.queue = { category: '', status: 'all', search: '' }; state.selectedCalibration = '';
    saveWorkspace(); persistStatistics(); storageAdapter.write(STORAGE_KEYS.index, 0); void loadImages(); renderRoute();
  }

  function getElapsedMs() { return (getDraft().elapsedMs || 0) + (state.timer ? Date.now() - state.timer.startedAt : 0); }

  function formatDuration(milliseconds) { const seconds = Math.floor(milliseconds / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }

  function pauseTimer() {
    if (!state.timer) return;
    getDraft().elapsedMs = getElapsedMs(); clearInterval(state.timer.interval); state.timer = null; persistDraft();
  }

  function toggleTimer() {
    if (state.timer) pauseTimer();
    else state.timer = { startedAt: Date.now(), interval: setInterval(() => { const element = document.querySelector('#review-timer-value'); if (element) element.textContent = formatDuration(getElapsedMs()); }, 1000) };
    renderReview();
  }

  function renderCalibration() {
    const reviews = getReviews();
    const pending = reviews.filter(needsAdjudication);
    const chosen = reviews.find(review => review.sample_id === state.selectedCalibration) || pending[0] || reviews[0];
    if (chosen) state.selectedCalibration = chosen.sample_id;
    document.querySelector('#page-calibration').innerHTML = heading({ eyebrow: 'CALIBRATION / 分歧裁决', title: '保留初判，再记录为什么改', description: '这是单机裁决记录，不模拟多人身份或真实协作。初判、一致率与最终裁决分别保存。' }) + `<div class="metric-strip card"><div>${pending.length}<small>待裁决</small></div><div>${reviews.filter(review => getAdjudication(review)).length}<small>当前版本已裁决</small></div><div>${reviews.length}<small>已人审</small></div></div><div class="section-grid"><article class="card"><h2>复核记录</h2><div class="queue-list">${reviews.length ? reviews.map(review => `<button class="queue-item ${chosen === review ? 'active' : ''}" data-action="select-calibration" data-id="${escapeHtml(review.sample_id)}"><strong>${escapeHtml(review.sample_id)}</strong>${statusPill(getAdjudication(review) ? 'usable' : needsAdjudication(review) ? 'blocked' : 'pending', getAdjudication(review) ? '已裁决' : needsAdjudication(review) ? '待裁决' : '可抽检')}<small>${review.agreement ? `初判一致 ${review.agreement.agree_items}/${review.agreement.total_items}` : '非独立盲判或机器结果不可比'}</small></button>`).join('') : '<p class="empty-state">先保存一条评分，才能进行裁决。</p>'}</div></article><article class="card">${chosen ? renderAdjudicationForm(chosen) : '<p class="muted">分歧不会自动判定人工或机器谁对，需要结合证据确认。</p>'}</article></div>`;
  }

  function renderAdjudicationForm(review) {
    const sample = getSamples().find(item => item.sample_id === review.sample_id);
    const previous = getAdjudication(review);
    const scores = previous?.final_scores || review.human_scores;
    return `<h2>${escapeHtml(sample.sample_id)} · 第 ${review.revision} 次初判</h2><p class="muted">原始记录不改写；再次裁决会追加历史。</p><form id="adjudication-form"><div class="table-wrap"><table class="data-table"><thead><tr><th>维度</th><th>机器</th><th>独立初判</th><th>最终判定</th></tr></thead><tbody>${DIMENSIONS.map(dimension => `<tr><td>${dimension.code} ${dimension.name}</td><td>${sample.machine_scores[dimension.code] ?? '不适用 / 无结果'}</td><td>${review.human_scores[dimension.code] ?? '不适用'}</td><td>${sample.applicable_dims.includes(dimension.code) ? `<select name="score_${dimension.code}" aria-label="${dimension.name}最终判定">${[2, 1, 0].map(score => `<option value="${score}" ${scores[dimension.code] === score ? 'selected' : ''}>${score} ${SCORE_LABELS[score]}</option>`).join('')}</select>` : '不适用'}</td></tr>`).join('')}</tbody></table></div><div class="form-grid"><label class="field">分歧原因<select name="cause"><option>机器误判</option><option>人工误判</option><option>评分规则不清</option><option>证据不足</option><option>抽检确认无误</option></select></label><label class="field">最终商用结论<select name="decision" required>${Object.entries({ blocked: '暂缓放行 / 补充证据', usable: '可用', repair: '需修后再评', discard: '不可用 / 重新生成' }).map(([value, label]) => `<option value="${value}" ${previous?.decision === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field">裁决人<input name="reviewer" value="${escapeHtml(previous?.reviewer || '')}" placeholder="填写实际裁决人" required></label></div><label class="field">最终保留的缺陷<select name="defect_policy"><option value="keep">保留本次人工缺陷</option><option value="clear">经核验，无需保留这些缺陷</option></select></label><label class="field">证据与裁决理由<textarea name="reason" rows="3" placeholder="写清楚看到什么、原判哪里不对、为什么作出最终结论。" required>${escapeHtml(previous?.reason || '')}</textarea></label><label class="switch-control"><input type="checkbox" name="ack_gate">如解除严重问题阻断，我已说明原因并确认处置方式</label><div class="form-actions"><button class="button primary" type="submit">保存裁决并更新报告</button><button class="button secondary" type="button" data-action="jump-id" data-id="${escapeHtml(sample.sample_id)}">回到图片与证据</button></div></form><details class="audit-list"><summary>查看初判及裁决历史</summary><p>初判：${formatDate(review.saved_at)} · ${escapeHtml(review.standard_version || '旧版记录')} · ${escapeHtml(review.note)}</p>${state.workspace.adjudications.filter(item => item.run_id === review.run_id && item.sample_id === review.sample_id).map(item => `<p>${formatDate(item.saved_at)} · ${escapeHtml(item.reviewer)} · ${escapeHtml(item.cause)} · ${escapeHtml(item.decision)}：${escapeHtml(item.reason)}</p>`).join('')}${state.workspace.history.filter(item => item.run_id === review.run_id && item.sample_id === review.sample_id).map(item => `<p>留档初判 #${item.revision} · ${formatDate(item.saved_at)} · ${escapeHtml(item.note)}</p>`).join('')}</details>`;
  }

  function submitAdjudication(form) {
    const fields = new FormData(form);
    const review = findReview(state.selectedCalibration);
    const sample = getSamples().find(item => item.sample_id === review.sample_id);
    const scores = Object.fromEntries(sample.applicable_dims.map(code => [code, Number(fields.get(`score_${code}`))]));
    const defects = fields.get('defect_policy') === 'clear' ? [] : structuredClone(review.defects);
    const blocked = getOutcome(sample, { scores, defects, rules: review.rules_snapshot }).status === 'blocked';
    if (blocked && fields.get('decision') !== 'blocked' && !fields.get('ack_gate')) { toast('解除严重问题阻断前，请确认已说明原因和处置方式。'); return; }
    const record = { adjudication_id: crypto.randomUUID(), run_id: review.run_id, sample_id: review.sample_id, review_revision: review.revision, final_scores: scores, final_defects: defects,
      decision: fields.get('decision'), cause: fields.get('cause'), reviewer: String(fields.get('reviewer')).trim(), reason: String(fields.get('reason')).trim(), gate_acknowledged: Boolean(fields.get('ack_gate')), saved_at: new Date().toISOString() };
    if (!record.reviewer || !record.reason) { toast('请填写裁决人和证据理由。'); return; }
    state.workspace.adjudications.push(record); saveWorkspace(); renderCalibration(); updateBadges(); toast('裁决已追加，最终报告已更新；独立初判一致率保持不变。');
  }

  function getRunComparisons() {
    const current = getActiveRun();
    const samples = getSamples();
    const compatible = state.workspace.runs.filter(run => run.run_id !== current.run_id && run.dataset_version === current.dataset_version && run.standard_version === current.standard_version && JSON.stringify(run.rules) === JSON.stringify(current.rules) && JSON.stringify(run.standards) === JSON.stringify(current.standards) && getSamplesForRun(run.run_id).length);
    const baseline = compatible.find(run => run.run_id === state.compareRunId);
    if (!baseline) return { baseline: null, rows: [] };
    const oldSamples = getSamplesForRun(baseline.run_id);
    const shared = samples.filter(sample => oldSamples.some(old => old.sample_id === sample.sample_id && old.prompt_raw === sample.prompt_raw));
    const rows = DIMENSIONS.map(dimension => {
      const paired = shared.flatMap(sample => {
        const old = oldSamples.find(item => item.sample_id === sample.sample_id);
        return sample.applicable_dims.includes(dimension.code) && old.applicable_dims.includes(dimension.code) && Number.isInteger(sample.machine_scores[dimension.code]) && Number.isInteger(old.machine_scores[dimension.code]) ? [[old.machine_scores[dimension.code], sample.machine_scores[dimension.code]]] : [];
      });
      const before = paired.length ? paired.reduce((total, pair) => total + pair[0], 0) / paired.length : null;
      const after = paired.length ? paired.reduce((total, pair) => total + pair[1], 0) / paired.length : null;
      return { ...dimension, previous: before, current: after, count: paired.length, relative_change: before === null ? null : getRelativeChange(before, after) };
    });
    return { baseline, rows, shared_count: shared.length };
  }

  function renderComparison() {
    const current = getActiveRun();
    const candidates = state.workspace.runs.filter(run => run.run_id !== current.run_id && getSamplesForRun(run.run_id).length);
    const comparison = getRunComparisons();
    const snapshots = VERSION_STATS.slice(-2);
    return `<article class="card"><div class="card-heading"><h2>同题版本对比 · 机器原始结果</h2><label>对照批次<select id="compare-run"><option value="">选择对照批次</option>${candidates.map(run => `<option value="${escapeHtml(run.run_id)}" ${state.compareRunId === run.run_id ? 'selected' : ''}>${escapeHtml(run.run_id)} · ${escapeHtml(run.model_version)}</option>`).join('')}</select></label></div>${comparison.baseline ? `<p class="muted">同一评测集与规则版本，按样本编号和完全相同的原始指令配对，共 ${comparison.shared_count} 条。PE 和生成参数差异仍需人工核对，不自动归因到模型。</p><div class="table-wrap"><table class="data-table"><thead><tr><th>维度</th><th>对照均分</th><th>当前均分</th><th>相对变化</th><th>配对样本</th></tr></thead><tbody>${comparison.rows.map(row => `<tr><td>${row.code} ${row.name}</td><td>${row.previous?.toFixed(2) ?? '—'}</td><td>${row.current?.toFixed(2) ?? '—'}</td><td class="${row.relative_change >= 0 ? 'match' : 'mismatch'}">${formatChange(row.relative_change)}</td><td>${row.count}</td></tr>`).join('')}</tbody></table></div>` : '<p class="notice compact">请选择有逐条结果、评测集版本与评分规则版本一致的批次。条件不符时不输出“模型提升了多少”的结论。</p>'}<p class="muted">变化 =（当前分 − 对照分）÷ 对照分 ×100%。对照为 0 时不计算；它不是准确率变化。</p>${current.source === 'demo' ? `<details><summary>查看原有 v1.3 → v1.4 演示快照（非本地复核结果）</summary><div class="table-wrap"><table class="data-table"><thead><tr><th>维度</th><th>v1.3</th><th>v1.4</th><th>相对变化</th></tr></thead><tbody>${DIMENSIONS.map(dimension => `<tr><td>${dimension.code} ${dimension.name}</td><td>${snapshots[0].scores[dimension.code]}</td><td>${snapshots[1].scores[dimension.code]}</td><td class="match">${formatChange(getRelativeChange(snapshots[0].scores[dimension.code], snapshots[1].scores[dimension.code]))}</td></tr>`).join('')}</tbody></table></div></details>` : ''}</article>`;
  }

  function renderReliability() {
    const adjudicated = getReviews().filter(review => getAdjudication(review));
    const comparable = adjudicated.flatMap(review => {
      const sample = getSamples().find(item => item.sample_id === review.sample_id);
      if (sample.machine_status && sample.machine_status !== 'complete') return [];
      const machine = getOutcome(sample, { scores: sample.machine_scores, defects: sample.machine_defects });
      return [{ machine: machine.status, final: getAdjudication(review).decision }];
    });
    const falsePass = comparable.filter(item => item.machine === 'usable' && ['repair', 'discard'].includes(item.final)).length;
    const falseBlock = comparable.filter(item => item.machine !== 'usable' && item.final === 'usable').length;
    return `<article class="card"><h2>可靠性：把一致与正确分开看</h2><div class="metric-strip"><div>${adjudicated.length}<small>已裁决样本</small></div><div>${falsePass}<small>机器错放行 / ${comparable.length} 条可比裁决</small></div><div>${falseBlock}<small>机器未放行、最终可用 / ${comparable.length}</small></div></div><p class="muted">仅是已裁决记录的观察，不代表全量准确率。专挑风险样本得到的比例不能直接推到总体；未裁决的样本不作为标准答案。</p></article>`;
  }

  function renderEfficiency() {
    const entries = [...getReviews(), ...state.workspace.history.filter(review => review.run_id === getActiveRun().run_id)];
    const manual = entries.reduce((total, review) => total + (review.elapsed_ms || 0), 0) / 60000;
    const baseline = state.workspace.efficiency[getActiveRun().run_id];
    const complete = getReviews().length === getSamples().length && getSamples().length > 0 && entries.every(review => review.elapsed_ms > 0);
    const currentMinutes = manual + Number(baseline?.generation_minutes || 0) + Number(baseline?.scoring_minutes || 0);
    return `<article class="card"><h2>实际耗时复盘</h2><p>已记录人工复核 ${manual.toFixed(2)} 分钟（含重判留档）。计时只在点击“开始计时”后累计，离开页面或切后台会暂停。</p><form id="efficiency-form"><div class="form-grid"><label class="field">同一批样本旧流程总分钟<input type="number" min="0.01" step="0.01" name="baseline_minutes" value="${baseline?.baseline_minutes || ''}" required></label><label class="field">本轮生成耗时（分钟，手工登记）<input type="number" min="0" step="0.01" name="generation_minutes" value="${baseline?.generation_minutes ?? ''}" required></label><label class="field">本轮自动评分耗时（分钟，手工登记）<input type="number" min="0" step="0.01" name="scoring_minutes" value="${baseline?.scoring_minutes ?? ''}" required></label></div><label class="field">测量说明<input name="note" value="${escapeHtml(baseline?.note || '')}" placeholder="确认同一批样本、相同计时范围；注明串行或并行统计。" required></label><button class="button secondary" type="submit">保存实测基线</button></form><p class="notice compact">${baseline && complete ? `按已登记的顺序累计口径，本轮 ${currentMinutes.toFixed(2)} 分钟，对比旧流程 ${baseline.baseline_minutes} 分钟，耗时变化 ${formatChange(getRelativeChange(baseline.baseline_minutes, currentMinutes))}。仍需结合严重漏判、返工和抽样覆盖判断质量。` : '只有同一批样本全部完成且计时完整、填写真实旧流程基线后，才计算耗时变化。尚无证据证明“12 人天变 1 人天”。'}</p></article>`;
  }

  function drillDefect(button) {
    const row = getHeatmap().find(item => item.category === button.dataset.category);
    const cell = row.cells.find(item => item.code === button.dataset.code);
    document.querySelector('#task-dialog-content').innerHTML = `<h2>${escapeHtml(button.dataset.category)} · ${escapeHtml(button.dataset.code)}</h2><p>${cell.defective_samples}/${cell.total_samples} 条，${percent(cell.rate)}</p><div class="queue-list">${cell.sample_ids.map(sampleId => `<button class="button secondary" data-action="drill-jump" data-id="${escapeHtml(sampleId)}">${escapeHtml(sampleId)} → 查看证据</button>`).join('')}</div>`;
    document.querySelector('#task-dialog').showModal();
  }

  function renderCases() {
    const cases = state.workspace.cases.filter(item => item.run_id === getActiveRun().run_id);
    document.querySelector('#page-cases').innerHTML = heading({ eyebrow: 'CASES & REGRESSION / 案例与改进', title: '让这轮发现的问题，有下一步', description: '案例关联实际评分记录；回归是否通过由新批次记录支撑，不自动标记已解决。' }) + `<article class="card"><h2>从已保存样本建立案例或改进项</h2><form id="case-form"><div class="form-grid"><label class="field">关联样本<select name="sample_id" required><option value="">选择已保存样本</option>${getReviews().map(review => `<option>${escapeHtml(review.sample_id)}</option>`).join('')}</select></label><label class="field">类型<select name="type"><option value="negative">问题案例 / Badcase</option><option value="positive">标准正例 / Goodcase</option><option value="rule">规则澄清</option></select></label><label class="field">负责人<input name="owner" placeholder="填写实际跟进人" required></label></div><label class="field">问题或可复用经验<textarea name="note" rows="2" required></textarea></label><button class="button primary" type="submit" ${getReviews().length ? '' : 'disabled'}>建立案例与改进项</button></form></article><div class="case-grid">${cases.length ? cases.map(item => renderCaseItem(item)).join('') : '<article class="card empty-state">暂无案例。先保存复核，再将典型问题或已裁决样本沉淀下来。</article>'}</div>`;
  }

  function renderCaseItem(item) {
    const runs = state.workspace.runs.filter(run => run.run_id !== item.run_id && (state.workspace.imports[run.run_id]?.length || run.sample_count));
    return `<article class="card case-item"><div class="card-heading"><strong>${escapeHtml(item.sample_id)}</strong>${statusPill(item.status)}</div><p>${escapeHtml(item.note)}</p><p class="muted">${escapeHtml(item.type)} · 跟进人 ${escapeHtml(item.owner)} · 初判版本 ${item.review_revision}${item.adjudication_id ? ' · 已关联裁决' : ' · 尚未关联裁决'}</p><button class="button ghost small" data-action="jump-id" data-id="${escapeHtml(item.sample_id)}">查看原样本</button><form class="case-update-form" data-case-id="${item.case_id}"><label class="field">处理状态<select name="status">${Object.entries({ open: '待处理', doing: '处理中', verify: '待回归', done: '已验证' }).map(([value, label]) => `<option value="${value}" ${item.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field">回归批次<select name="regression_run_id"><option value="">选择有同样本复核记录的新批次</option>${runs.map(run => `<option value="${escapeHtml(run.run_id)}" ${item.regression_run_id === run.run_id ? 'selected' : ''}>${escapeHtml(run.run_id)}</option>`).join('')}</select></label><label class="field">处理 / 复测说明<textarea name="resolution" rows="2">${escapeHtml(item.resolution || '')}</textarea></label><button class="button secondary small" type="submit">保存进展</button></form>${item.verified_at ? `<small>回归已登记 ${formatDate(item.verified_at)}，请结合对应复核及裁决证据判断。</small>` : ''}</article>`;
  }

  function submitCase(form) {
    const fields = new FormData(form);
    const review = findReview(fields.get('sample_id'));
    const adjudication = getAdjudication(review);
    state.workspace.cases.push({ case_id: crypto.randomUUID(), run_id: review.run_id, sample_id: review.sample_id, review_revision: review.revision, adjudication_id: adjudication?.adjudication_id || null, type: fields.get('type'), owner: String(fields.get('owner')).trim(), note: String(fields.get('note')).trim(), status: 'open', created_at: new Date().toISOString() });
    saveWorkspace(); renderCases(); toast('已建立关联案例，后续处理和回归可继续记录。');
  }

  function updateCase(form) {
    const fields = new FormData(form);
    const item = state.workspace.cases.find(record => record.case_id === form.dataset.caseId);
    const runId = String(fields.get('regression_run_id'));
    const regression = state.reviews.find(review => review.run_id === runId && review.sample_id === item.sample_id);
    if (fields.get('status') === 'done' && (!regression || !String(fields.get('resolution')).trim())) { toast('标记已验证前，需要新批次中同样本的实际复核记录和复测说明。'); return; }
    if (fields.get('status') === 'done') {
      const sample = getSamplesForRun(runId).find(record => record.sample_id === item.sample_id);
      const run = state.workspace.runs.find(record => record.run_id === runId);
      const originalRun = state.workspace.runs.find(record => record.run_id === item.run_id);
      const outcome = getOutcome(sample, { scores: regression.human_scores, defects: regression.defects, rules: regression.rules_snapshot, adjudication: getAdjudication(regression) });
      if (run.dataset_version !== originalRun.dataset_version || needsAdjudication(regression) || outcome.status !== 'usable') { toast('回归批次需同一评测集，且同样本最终可用、没有未解决分歧或阻断，才能标记已验证。'); return; }
    }
    Object.assign(item, { status: fields.get('status'), regression_run_id: runId || null, resolution: String(fields.get('resolution')).trim(), verified_at: fields.get('status') === 'done' ? new Date().toISOString() : null });
    saveWorkspace(); renderCases(); toast('跟进记录已保存。');
  }

  function renderPeChecks() {
    if (!state.pe.result) return '';
    const context = state.pe.lastContext;
    if (context) {
      const warnings = [...new Set([...context.warnings, ...window.PE_ENGINE.check(context)])];
      const explicit = Object.entries(context.explicit || {});
      return `<div class="pe-checks"><h3>明确要求核对</h3><p class="muted">以下来自你的原话；规则补充内容可在识别过程里查看来源。</p>${explicit.length ? `<ul>${explicit.map(([path, value]) => `<li>${escapeHtml(labelPeParameter(path))}：${escapeHtml(String(value))}</li>`).join('')}</ul>` : '<p>尚无可确认的商品或画面参数，请核对主体和拍摄要求。</p>'}${warnings.map(warning => `<p class="notice compact">${escapeHtml(warning)}</p>`).join('')}</div>`;
    }
    const checks = getPromptChecks(state.pe.raw, state.pe.result);
    return `<div class="pe-checks"><p class="notice compact">当前结果来自 ${escapeHtml(state.pe.resultVersion || '旧版预置')}；选择其他模板后，请点击转写生成对应结果。</p><h3>明确要求核对</h3><p>${checks.explicit_constraints.map(escapeHtml).join('；') || '尚无明确要求'}</p><p class="muted">原要求待补充：${checks.missing_fields.map(key => PE_FIELDS[key]).join('、') || '六段均有明确输入'}</p>${checks.warnings.map(warning => `<p class="notice compact">${escapeHtml(warning)}</p>`).join('')}${checks.fuzzy_terms.map(item => `<p><strong>${escapeHtml(item.term)} · 待确认建议</strong>：${escapeHtml(item.suggestion)}</p>`).join('')}</div>`;
  }

  function renderPeExperiments() {
    return `<article class="card"><div class="card-heading"><div><h2>转写实验记录</h2><p class="muted">保存生成时原话、完整提示词与规则快照；关联同条件两轮实际复核后才展示变化。</p></div><button class="button secondary" data-action="save-pe-experiment" ${state.pe.result && !isPeResultStale() ? '' : 'disabled'}>保存这次转写</button></div><div class="experiment-list">${state.workspace.experiments.length ? state.workspace.experiments.map(renderPeExperiment).join('') : '<p class="empty-state">暂无实验记录，完成转写后可保存。</p>'}</div></article>`;
  }

  function renderPeExperiment(experiment) {
    return `<div class="experiment-item"><strong>${escapeHtml(experiment.pe_version)}</strong>${experiment.rules_version ? `<span class="pill gray">${escapeHtml(experiment.rules_version)}</span>` : ''}<p>${escapeHtml(experiment.prompt_raw)}</p><small>${formatDate(experiment.created_at)} · ${experiment.prompt_full ? '已保存完整提示词' : '历史六段记录'}</small><details class="pe-experiment-detail"><summary>查看保存的提示词</summary><pre>${escapeHtml(experiment.prompt_full || formatPeSections(experiment.prompt_sections))}</pre></details><form class="experiment-form" data-experiment-id="${escapeHtml(experiment.experiment_id)}"><div class="form-grid"><label class="field">原指令运行<select name="baseline_run_id"><option value="">选择</option>${renderRunOptions(experiment.baseline_run_id)}</select></label><label class="field">改写后运行<select name="compared_run_id"><option value="">选择</option>${renderRunOptions(experiment.compared_run_id)}</select></label></div><button class="button secondary small">关联实际结果</button></form><p class="muted">${escapeHtml(experiment.conclusion || '待关联评测，不预填提升效果。')}</p></div>`;
  }

  function renderRunOptions(selected) {
    return state.workspace.runs.filter(run => state.workspace.imports[run.run_id]?.length || run.sample_count).map(run => `<option value="${escapeHtml(run.run_id)}" ${selected === run.run_id ? 'selected' : ''}>${escapeHtml(run.run_id)} · ${escapeHtml(run.pe_version)}</option>`).join('');
  }

  function savePeExperiment() {
    if (!requireCurrentPeResult()) return;
    const context = state.pe.lastContext;
    const artifact = { prompt_full: getPeOutputText(), engine_version: context?.version || state.pe.resultVersion, rules_version: context?.rulesVersion || null, constraints: context?.result.constraints || '', negatives: context ? [...context.result.negatives] : [], params: context ? structuredClone(context.params) : null, category: context?.category || state.pe.category, context: context ? structuredClone(context) : null, input_snapshot: { ...state.pe.resultSnapshot } };
    const experiment = createPromptExperiment({ experimentId: crypto.randomUUID(), runId: getActiveRun().run_id, sampleId: getSamples()[state.currentIndex]?.sample_id, version: state.pe.resultVersion, raw: state.pe.resultSnapshot.raw, result: state.pe.result, createdAt: new Date().toISOString(), artifact });
    const workspace = { ...state.workspace, experiments: [...state.workspace.experiments, experiment] };
    if (!storageAdapter.write(STORAGE_KEYS.workspace, workspace)) { toast('实验未能保存，请先复制提示词。'); return; }
    state.workspace = workspace; renderPe(); toast('已保存完整转写快照，等待实际评测。');
  }

  function linkExperiment(form) {
    const fields = new FormData(form);
    const before = String(fields.get('baseline_run_id')); const after = String(fields.get('compared_run_id'));
    if (!before || !after || before === after) { toast('请选择两个不同的实际运行。'); return; }
    const oldRun = state.workspace.runs.find(run => run.run_id === before); const newRun = state.workspace.runs.find(run => run.run_id === after);
    if (oldRun.dataset_version !== newRun.dataset_version || oldRun.model_version !== newRun.model_version || oldRun.standard_version !== newRun.standard_version || JSON.stringify(oldRun.generation_params) !== JSON.stringify(newRun.generation_params) || oldRun.seed !== newRun.seed) { toast('PE 对照需同一模型、评测集、规则和生成条件，避免把其他变化归因给 PE。'); return; }
    const conditions = [oldRun.seed, newRun.seed, ...Object.values(oldRun.generation_params), ...Object.values(newRun.generation_params)];
    if (conditions.some(value => value == null || /未记录|待补充|未知/.test(String(value)))) { toast('生成条件仍有未记录项，补全后再比较 PE 效果。'); return; }
    const experiment = state.workspace.experiments.find(item => item.experiment_id === form.dataset.experimentId);
    const normalizePrompt = text => text.replace(/\s+/g, '');
    const expanded = experiment.prompt_full || formatPeSections(experiment.prompt_sections);
    const oldReviews = state.reviews.filter(review => review.run_id === before); const newReviews = state.reviews.filter(review => review.run_id === after);
    const pairs = oldReviews.flatMap(review => {
      const newer = newReviews.find(item => item.sample_id === review.sample_id);
      const oldSample = getSamplesForRun(before).find(sample => sample.sample_id === review.sample_id);
      const newSample = getSamplesForRun(after).find(sample => sample.sample_id === review.sample_id);
      const bound = oldSample && newSample && normalizePrompt(oldSample.prompt_raw) === normalizePrompt(experiment.prompt_raw) && normalizePrompt(newSample.prompt_raw) === normalizePrompt(expanded);
      return newer && bound ? [[review.weighted_quality, newer.weighted_quality]] : [];
    });
    if (!pairs.length) { toast('需要同样本实际复核，且两轮指令分别对应保存的原话和完整改写提示词。'); return; }
    const previous = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length; const current = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    Object.assign(experiment, { baseline_run_id: before, compared_run_id: after, status: 'compared', conclusion: `已关联 ${pairs.length} 条同样本复核。加权质量均分 ${percent(previous)} → ${percent(current)}，相对变化 ${formatChange(getRelativeChange(previous, current))}；仅适用于这批配对样本，不等于整体可用率提升。` });
    saveWorkspace(); renderPe();
  }

  function updateBadges() {
    document.querySelector('#review-badge').textContent = Math.max(0, getSamples().length - getReviews().length);
    document.querySelector('#task-badge').textContent = state.workspace.runs.length;
    const badge = document.querySelector('#calibration-badge'); if (badge) badge.textContent = getReviews().filter(needsAdjudication).length;
  }

  function downloadJson(filename, payload) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadTemplate() {
    const run = { ...RUN_METADATA[0], run_id: `RUN-IMPORT-${Date.now()}`, purpose: '请填写本轮目标', sampling_strategy: '请填写随机 / 分层抽检 / 风险复核' };
    downloadJson('evaluation-import-template.json', { run, samples: structuredClone(SAMPLES) });
    toast('已下载结构模板，其中样本仍为演示数据，使用前请替换。');
  }

  async function importDataset(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const result = validateImport(payload);
      if (!result.ok) { showImportErrors(result.errors); return; }
      if (state.workspace.runs.some(run => run.run_id === result.run.run_id)) { showImportErrors(['运行编号已存在，请使用新的 run_id。旧数据不会被覆盖。']); return; }
      const nextWorkspace = { ...state.workspace, runs: [...state.workspace.runs, { ...result.run, rules: { ...getActiveRun().rules }, standards: structuredClone(getStandards()), created_at: result.run.created_at || new Date().toISOString() }], imports: { ...state.workspace.imports, [result.run.run_id]: result.samples } };
      if (!storageAdapter.write(STORAGE_KEYS.workspace, nextWorkspace)) { toast('导入未保存：本地存储不可用或空间不足。'); return; }
      state.workspace = nextWorkspace; selectRun(result.run.run_id); location.hash = '#/task'; toast(`已导入 ${result.samples.length} 条，图片可在复核页关联。`);
    } catch (error) { showImportErrors([`无法导入：${error.message}`]); }
    finally { document.querySelector('#dataset-import').value = ''; }
  }

  function showImportErrors(errors) {
    if (state.route !== 'setup') { location.hash = '#/setup'; state.pendingImportErrors = errors; }
    else { const feedback = document.querySelector('#import-feedback'); feedback.hidden = false; feedback.textContent = errors.join('；'); }
    toast('导入校验未通过，原有数据保持不变。');
  }

  function openImageStore() {
    if (state.imageDb) return state.imageDb;
    state.imageDb = new Promise((resolve, reject) => {
      const request = indexedDB.open('evaluation_workbench_images', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return state.imageDb;
  }

  async function readImageRecords() {
    const database = await openImageStore();
    return new Promise((resolve, reject) => {
      const request = database.transaction('images', 'readonly').objectStore('images').getAll();
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }

  async function writeImageRecord(record) {
    const database = await openImageStore();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('images', 'readwrite');
      transaction.objectStore('images').put(record);
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
  }

  async function loadImages() {
    try {
      const records = await readImageRecords();
      Object.values(state.imageUrls).forEach(url => URL.revokeObjectURL(url)); state.imageUrls = {};
      records.forEach(record => { state.imageUrls[record.key] = URL.createObjectURL(record.blob); });
      if (state.route === 'review') renderReview();
    } catch (error) { console.warn('本地图片存储未启用', error); toast('本地图片存储不可用，评分数据仍可使用。'); }
  }

  function requestImageUpload(kind) {
    state.imageUpload = { key: `${getReviewKey(getSamples()[state.currentIndex].sample_id)}:${kind}`, sampleId: getSamples()[state.currentIndex].sample_id, kind };
    document.querySelector('#image-input').click();
  }

  async function uploadImage(file) {
    if (!file || !state.imageUpload) return;
    const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > MAX_IMAGE_BYTES) { toast('请选择 12MB 以内的 PNG、JPG、WebP 或 GIF 图片。'); return; }
    try {
      const record = { key: state.imageUpload.key, blob: file, filename: file.name, saved_at: new Date().toISOString() };
      await writeImageRecord(record);
      if (state.imageUrls[record.key]) URL.revokeObjectURL(state.imageUrls[record.key]);
      state.imageUrls[record.key] = URL.createObjectURL(file); renderReview(); toast('图片已保存在本机，刷新后可恢复。');
    } catch (error) { toast(`图片保存失败：${error.message}`); }
    finally { document.querySelector('#image-input').value = ''; state.imageUpload = null; }
  }

  function zoomImage(key) {
    const url = state.imageUrls[key]; if (!url) return;
    document.querySelector('#image-dialog-content').innerHTML = `<h2>图片细节对照</h2><label class="field">放大倍数<input id="image-zoom" type="range" min="1" max="4" step="0.25" value="1"></label><div class="zoom-view"><img id="zoom-image" src="${url}" alt="评测原图细节，滑块可放大"></div>`;
    document.querySelector('#image-dialog').showModal();
  }

  function markImage(event) {
    const stage = event.target.closest('[data-mark-stage]');
    if (!stage || getDraft().saved || !stage.querySelector('img')) return;
    const bounds = stage.getBoundingClientRect();
    getDraft().marker = { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
    persistDraft(); renderReview(); toast('已标记位置，添加缺陷时会一并保存。');
  }

  function saveRules(form) {
    const fields = new FormData(form); const run = getActiveRun();
    const version = String(fields.get('standard_version')).trim();
    const changed = Boolean(fields.get('block_compliance_zero')) !== getActiveRun().rules.block_compliance_zero || Boolean(fields.get('block_p0')) !== getActiveRun().rules.block_p0;
    if (getReviews().length && (changed || version !== run.standard_version)) { toast('此批已有评分，规则已冻结。修改口径请导入新的批次，旧结论保持原规则。'); return; }
    run.rules = { block_compliance_zero: Boolean(fields.get('block_compliance_zero')), block_p0: Boolean(fields.get('block_p0')) }; run.standard_version = version; run.purpose = String(fields.get('purpose')).trim(); saveWorkspace(); renderSetup(); toast('本轮规则已保存。');
  }

  function saveStandards(form) {
    if (getReviews().length) { toast('此批已有评分，标准已冻结。请新建批次后修订标准。'); return; }
    const fields = new FormData(form);
    getActiveRun().standards = getStandards().map(standard => ({ ...standard, anchors: Object.fromEntries([2, 1, 0].map(score => [score, String(fields.get(`${standard.code}_${score}`)).trim()])) }));
    saveWorkspace(); toast('本批次标准说明已保存。正式修改判分口径请使用新的规则版本。');
  }

  function saveEfficiency(form) {
    const fields = new FormData(form);
    state.workspace.efficiency[getActiveRun().run_id] = { baseline_minutes: Number(fields.get('baseline_minutes')), generation_minutes: Number(fields.get('generation_minutes')), scoring_minutes: Number(fields.get('scoring_minutes')), sample_count: getSamples().length, note: String(fields.get('note')).trim(), saved_at: new Date().toISOString() };
    saveWorkspace(); renderReport(); toast('已记录手工实测基线，不会替代缺失的人审计时。');
  }

  function handleInput(event) {
    if (event.target.id === 'defect-note') { getDraft().note = event.target.value; persistDraft(); }
    if (event.target.id === 'pe-input') { state.pe.raw = event.target.value; savePeDraft(); refreshPeOutput(); }
    if (event.target.id === 'fuzzy-search') { state.filter = event.target.value; document.querySelector('#fuzzy-body').innerHTML = renderFuzzyRows(); }
    if (event.target.dataset.peField) editPeSection(event.target);
    if (event.target.id === 'image-zoom') document.querySelector('#zoom-image').style.width = `${Number(event.target.value) * 100}%`;
  }

  function handleChange(event) {
    if (event.target.id === 'pe-category') { state.pe.category = event.target.value; savePeDraft(); refreshPeOutput(); }
    if (event.target.id === 'blind-toggle') switchBlindMode(event.target.checked);
    if (event.target.id === 'defect-code') { getDraft().code = event.target.value; persistDraft(); }
    if (event.target.id === 'dataset-import') void importDataset(event.target.files[0]);
    if (event.target.id === 'image-input') void uploadImage(event.target.files[0]);
    if (event.target.id === 'compare-run') { state.compareRunId = event.target.value; renderReport(); }
    if (event.target.id === 'sample-jump' && event.target.value !== '') jumpToSample(getSamples()[Number(event.target.value)].sample_id);
    const queues = { 'queue-category': 'category', 'queue-status': 'status', 'queue-search': 'search' };
    if (queues[event.target.id]) { pauseTimer(); state.queue[queues[event.target.id]] = event.target.value; renderReview(); }
  }

  function splitPromptClauses(raw) {
    return [...new Set(String(raw).split(/[，,；;。\n]+/).map(clause => clause.trim()).filter(Boolean))];
  }

  function getPromptFieldRules() {
    return {
      structure: /结构|组件|层数|双层|单层|多层|三层|两层|\d+层|把手|旋钮|按钮|瓶盖|瓶口|肩带|数量|标识|标签|文字|水印|logo|不增|不减/i,
      material: /不锈钢|玻璃|皮革|陶瓷|塑料|金属|木质|棉|麻布|丝绸|磨砂|拉丝|亮面|材质|纹理|表面处理/,
      environment: /背景|场景|厨房|客厅|台面|梳妆台|户外|室内|白底|黑底|灰底|留白|道具|桌面|餐桌|摄影棚|纯色|环境/,
      lighting: /光照|光线|光源|自然光|侧光|逆光|顶光|柔光|硬光|晨光|阳光|灯光|冷光|暖光|色温|阴影|高光|\d+\s*K\b/i,
      composition: /\d+\s*[:：]\s*\d+|横版|竖版|方图|方形|画幅|构图|视角|俯视|平视|仰视|占比|画面|特写|全景|远景|近景|\d+\s*%/
    };
  }

  function isNegativePromptClause(clause) {
    return /不要|不能|不得|禁止|避免|不允许|不需要|不添加|不增加|不更改|不改变|不替换|不出现|无人物|无模特|无道具|无文字|无水印/.test(clause);
  }

  function isFuzzyOnlyClause(clause) {
    const remaining = FUZZY_MAP.reduce((text, item) => text.replaceAll(item.user_says, ''), clause);
    return /^[的地得要请更再一些一点点风格感觉做成来个就好\s]*$/.test(remaining);
  }

  function collectPromptFields(raw) {
    const clauses = splitPromptClauses(raw);
    const rules = getPromptFieldRules();
    const groups = Object.fromEntries(Object.keys(PE_FIELDS).map(key => [key, []]));
    const subjectPattern = /蒸锅|耳机|精华|护肤|瓶|包|鞋|服饰|模特|人物|咖啡|果汁|饮料|手表|手机|电脑|音箱|相机|口红|玩具|家具|沙发|椅|灯具|花瓶|商品|产品|一台|一件|一个|一只|一套|两台|两个|两只|\d+\s*(?:台|个|件|瓶|只|套|双|袋|盒|杯|支|辆|条|把)/;
    clauses.forEach(clause => {
      Object.entries(rules).forEach(([key, pattern]) => { if (pattern.test(clause)) groups[key].push(clause); });
    });
    groups.subject = clauses.filter(clause => !isNegativePromptClause(clause) && !isFuzzyOnlyClause(clause) && subjectPattern.test(clause));
    if (!groups.subject.length) {
      groups.subject = clauses.filter(clause => !isNegativePromptClause(clause) && !isFuzzyOnlyClause(clause) && !Object.values(rules).some(pattern => pattern.test(clause)));
    }
    clauses.forEach(clause => {
      if (!Object.values(groups).some(items => items.includes(clause)) && !isFuzzyOnlyClause(clause)) groups.structure.push(clause);
    });
    return groups;
  }

  function getPromptChecks(raw, result) {
    const clauses = splitPromptClauses(raw);
    const groups = collectPromptFields(raw);
    const fuzzyTerms = FUZZY_MAP.filter(item => raw.toLowerCase().includes(item.user_says.toLowerCase()));
    const warnings = [];
    const ratio = raw.match(/(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/);
    if (ratio && Number(ratio[2]) === 0) warnings.push('画幅比例的高度不能为 0，请确认原始要求。');
    if (ratio && /横版/.test(raw) && Number(ratio[1]) < Number(ratio[2])) warnings.push('“横版”与给出的宽高比例不一致，请确认后再使用。');
    if (ratio && /竖版/.test(raw) && Number(ratio[1]) > Number(ratio[2])) warnings.push('“竖版”与给出的宽高比例不一致，请确认后再使用。');
    if (/横版/.test(raw) && /竖版/.test(raw)) warnings.push('原始要求同时出现横版和竖版，请确认是否需要两种版本。');
    if (fuzzyTerms.length) warnings.push('模糊词的具体含义仍需确认；下方建议没有自动写成已确认的商品属性。');
    if (!groups.subject.length) warnings.push('尚未识别出明确主体，请补充商品名称；未自动猜测商品。');
    const resultText = Object.values(result).join('；');
    const lost = clauses.filter(clause => !isFuzzyOnlyClause(clause) && !resultText.includes(clause));
    if (lost.length) warnings.push(`编辑后有原始要求未出现在结果中：${lost.join('；')}。请确认是否有意删除。`);
    return {
      explicit_constraints: clauses.filter(clause => !isFuzzyOnlyClause(clause)),
      missing_fields: Object.keys(PE_FIELDS).filter(key => !groups[key].length),
      fuzzy_terms: fuzzyTerms.map(item => ({ term: item.user_says, suggestion: item.rewrite })),
      warnings
    };
  }

  function createPromptExperiment(options) {
    return {
      experiment_id: options.experimentId,
      run_id: options.runId || null,
      sample_id: options.sampleId || null,
      pe_version: options.version,
      prompt_raw: options.raw,
      prompt_sections: { ...options.result },
      ...options.artifact,
      created_at: options.createdAt,
      status: 'awaiting_evaluation',
      baseline_run_id: null,
      compared_run_id: null,
      conclusion: null
    };
  }
  setTheme(storageAdapter.read(STORAGE_KEYS.theme, matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  storageAdapter.write(STORAGE_KEYS.reviews, state.reviews); saveWorkspace(); persistStatistics(); bindEvents(); renderRoute(); void loadImages();
})();
