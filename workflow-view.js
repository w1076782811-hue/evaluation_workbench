/* 流程视图只接收快照并输出标记；数据、曝光和操作由应用层管理。 */
window.WORKFLOW_VIEW = (() => {
  'use strict';
  const PERCENT_SCALE = 100;
  const STAGE_IDS = ['inputs', 'machine', 'human', 'audit', 'adjudication', 'report'];
  const FILTER_OPTIONS = [
    ['all', '全部题目'], ['fallback', '机器缺结果'],
    ['returned', '机器已有结果'], ['pending_human', '尚未完成人审']
  ];
  const MACHINE_LABELS = {
    na: ['不适用', 'na'], completed: ['已有结果', 'result'],
    uncertain: ['无法判断', 'unresolved'], failed: ['执行失败', 'failed'],
    unsupported: ['不支持', 'unresolved'], cancelled: ['已取消', 'unresolved'],
    not_started: ['待执行', 'waiting'], queued: ['排队中', 'waiting'], running: ['执行中', 'waiting']
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function formatPercent(completed, total) {
    return total ? `${(completed / total * PERCENT_SCALE).toFixed(1).replace(/\.0$/, '')}%` : '—';
  }

  function renderFraction(completed, total, unit) {
    return `${completed} / ${total} ${unit}`;
  }

  function renderStage(stage, index) {
    const body = `<span class="workflow-step-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="workflow-step-label">${escapeHtml(stage.label)}</span>
      <strong class="workflow-step-value">${escapeHtml(stage.value)}</strong>
      <span class="workflow-step-detail">${escapeHtml(stage.detail)}</span>`;
    return `<li data-workflow-stage="${STAGE_IDS[index]}" class="workflow-step${stage.disabled ? ' workflow-step-unavailable' : ''}">${stage.disabled
      ? `<span class="workflow-step-link" aria-disabled="true">${body}</span>`
      : `<a class="workflow-step-link" href="#/${stage.route}">${body}</a>`}</li>`;
  }

  function getStages(totals) {
    const hasSamples = totals.sample_count > 0;
    const adjudicated = totals.adjudication_total - totals.adjudication_pending;
    const adjudicationDetail = totals.adjudication_total ? `${totals.adjudication_pending} 件待处理`
      : totals.human_reviewed_samples < totals.sample_count ? '等待人审发现需裁决项' : '当前无待裁决项';
    return [
      { label: '资料准备', value: renderFraction(totals.input_ready_samples, totals.sample_count, '道'), route: 'setup',
        detail: totals.placeholder_samples ? `${totals.placeholder_samples} 道仍含演示占位图` : hasSamples ? '按当前图片关联与组图检查' : '当前范围没有题目' },
      { label: '机器结果', value: renderFraction(totals.machine_result_items, totals.applicable_items, '项'), route: 'automation',
        detail: `结果覆盖 ${formatPercent(totals.machine_result_items, totals.applicable_items)}，不是执行进度` },
      { label: '人工全量复核', value: renderFraction(totals.human_completed_items, totals.human_total_items, '项'), route: 'review',
        detail: `已保存 ${totals.human_reviewed_samples} 道 · ${formatPercent(totals.human_completed_items, totals.human_total_items)}` },
      { label: '独立抽检', value: '尚未接入', disabled: true,
        detail: '后续接入固定名单与独立抽检' },
      { label: '分歧裁决', value: renderFraction(adjudicated, totals.adjudication_total, '件'), route: 'calibration',
        detail: adjudicationDetail },
      { label: '评测报告', value: '过程报告', route: 'report',
        detail: '整批闭环判定后续接入' }
    ];
  }

  function renderProgress(snapshot) {
    const { totals, mode } = snapshot;
    return `<section class="workflow-progress" aria-label="本范围流程进度">
      <div class="workflow-progress-heading"><strong>本范围流程进度</strong>
        <span class="workflow-mode-badge">${escapeHtml(mode.label)}</span><span>${totals.sample_count} 道题</span></div>
      <ol class="workflow-steps">${getStages(totals).map(renderStage).join('')}</ol>
      <p class="workflow-progress-note">本轮仍按全部适用维度人审；按项补评与独立抽检将分步接入。人工评完不代表整批闭环。</p>
    </section>`;
  }

  function renderMetric(metric) {
    return `<div class="workflow-metric"><span>${escapeHtml(metric.label)}</span>
      <strong>${metric.value}<small>${metric.unit}</small></strong><p>${escapeHtml(metric.detail)}</p></div>`;
  }

  function renderMetrics(totals) {
    const metrics = [
      { label: '机器已有有效分数', value: totals.machine_result_items, unit: '项', detail: `全部适用维度 ${totals.applicable_items} 项` },
      { label: '机器无有效分数', value: totals.machine_missing_items, unit: '项', detail: '无结果、失败等均不按 0 分处理' },
      { label: '涉及缺结果的题', value: totals.fallback_samples, unit: '道', detail: '需要人工补判，当前仍走全量复核' },
      { label: '尚未完成人审', value: totals.pending_human_samples, unit: '道', detail: `已保存 ${totals.human_reviewed_samples} / ${totals.sample_count} 道` }
    ];
    return `<div class="workflow-metrics">${metrics.map(renderMetric).join('')}</div>`;
  }

  function filterRows(rows, filter) {
    const search = String(filter.search || '').trim().toLowerCase();
    return rows.filter(row => {
      const matchesStatus = filter.status === 'fallback' ? row.fallback_count > 0
        : filter.status === 'returned' ? row.machine_result_count > 0
        : filter.status === 'pending_human' ? !row.reviewed : true;
      return matchesStatus && (!search || [row.sample_id, row.category, row.image_type].join(' ').toLowerCase().includes(search));
    });
  }

  function renderFilters(filter, matchedCount, totalCount) {
    return `<div class="workflow-filter-bar"><label class="workflow-field">查看范围
      <select id="automation-filter">${FILTER_OPTIONS.map(([value, label]) => `<option value="${value}"${filter.status === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="workflow-field workflow-search">搜索题号、品类或图型<input id="automation-search" type="search" value="${escapeHtml(filter.search || '')}" placeholder="例如 S3-004" autocomplete="off"></label>
      <p class="workflow-filter-count" role="status">显示 ${matchedCount} / ${totalCount} 道</p></div>`;
  }

  function renderMachineCell(item, exposed, dimension) {
    const [label, tone] = MACHINE_LABELS[item?.machine_status] || ['无有效结果', 'unresolved'];
    const scoreVisible = exposed && item?.has_machine_result && [0, 1, 2].includes(item.machine_score);
    const text = scoreVisible ? `${item.machine_score} 分` : label;
    return `<td data-dimension="${escapeHtml(dimension)}"><span class="workflow-machine-status workflow-status-${tone}">${escapeHtml(text)}</span></td>`;
  }

  function renderMatrixRow(options) {
    const { row, dimensions, items, exposed, selected } = options;
    const sampleId = escapeHtml(row.sample_id);
    return `<tr${selected ? ' class="workflow-row-selected"' : ''} data-sample-id="${sampleId}">
      <th scope="row"><strong class="workflow-sample-id">${sampleId}</strong><span class="workflow-sample-meta">${escapeHtml(row.category)} · ${escapeHtml(row.image_type)}</span>
        <span class="workflow-sample-meta">人工全量复核 ${row.human_completed_count} / ${row.applicable_count} 项</span></th>
      ${dimensions.map(dimension => renderMachineCell(items.get(dimension.code), exposed, dimension.code)).join('')}
      <td class="workflow-row-actions"><button class="button secondary small" data-action="inspect-machine" data-id="${sampleId}">${exposed ? '再次查看机器结果' : '查看机器分数／证据'}</button>
        <button class="button ghost small" data-action="workflow-review" data-id="${sampleId}">${row.reviewed ? '查看已保存人审' : '继续全量人审'}</button>
        ${exposed ? '<span class="workflow-exposure-note">已查看机器结果</span>' : '<span class="workflow-sample-meta">默认隐藏分数，保护独立判断</span>'}</td></tr>`;
  }

  function renderMatrix(options) {
    const { rows, dimensions, items, exposedSampleIds, selectedSampleId } = options;
    if (!rows.length) return '<div class="workflow-empty"><strong>当前筛选没有匹配题目</strong><p>调整查看范围或清空搜索，原评分与图片仍然保留。</p></div>';
    const sampleItems = new Map();
    items.forEach(item => {
      if (!sampleItems.has(item.sample_id)) sampleItems.set(item.sample_id, new Map());
      sampleItems.get(item.sample_id).set(item.dimension, item);
    });
    const exposed = new Set(exposedSampleIds);
    return `<div class="workflow-matrix-scroll" tabindex="0" role="region" aria-label="逐题逐维机器状态表，可横向滚动">
      <table class="workflow-matrix"><caption>机器状态按维度展示；分数默认隐藏，查看前会记录曝光。</caption>
        <thead><tr><th scope="col">样本 / 人审进度</th>${dimensions.map(dimension => `<th scope="col"><span>${escapeHtml(dimension.code)}</span><small>${escapeHtml(dimension.name)}</small></th>`).join('')}<th scope="col">查看与处理</th></tr></thead>
        <tbody>${rows.map(row => renderMatrixRow({ row, dimensions, items: sampleItems.get(row.sample_id) || new Map(), exposed: exposed.has(row.sample_id), selected: selectedSampleId === row.sample_id })).join('')}</tbody>
      </table></div>`;
  }

  function renderAutomation(options) {
    const { snapshot, dimensions, filter = {}, selectedSampleId = null, exposedSampleIds = [] } = options;
    const rows = filterRows(snapshot.sampleRows, filter);
    return `<div class="workflow-source-notice"><strong>${escapeHtml(snapshot.mode.label)}</strong><p>${escapeHtml(snapshot.mode.description)}</p>
      <p>当前展示既有机器结果与人工全量复核进度；按项自动分工、独立抽检与真实服务执行将分步接入。</p></div>
      ${renderMetrics(snapshot.totals)}<article class="card workflow-automation-card"><div class="workflow-matrix-heading"><div><h2>机器评了哪些，哪些仍需人工判断</h2>
        <p>同一道题可以部分已有结果、部分缺结果；两类筛选会有重叠。表格可左右滚动查看全部维度。</p></div></div>
      ${renderFilters(filter, rows.length, snapshot.totals.sample_count)}
      ${renderMatrix({ rows, dimensions, items: snapshot.items, exposedSampleIds, selectedSampleId })}
      <p class="workflow-matrix-footnote">“已有结果”只表示存在合法机器分数，不表示机器判对、已经人工确认或可以直接放行。不适用维度不计入工作量。</p></article>`;
  }

  return { renderProgress, renderAutomation };
})();
