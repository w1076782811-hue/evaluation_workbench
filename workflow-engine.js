/* 依据现有记录派生流程视图；不执行机器评测、不代替分工或抽检决策。 */
window.WORKFLOW_ENGINE = (() => {
  'use strict';
  const DIMENSION_CODES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'];
  const VALID_SCORES = [0, 1, 2];
  const MODE_DESCRIPTIONS = {
    demo: { key: 'demo', label: '流程演示', description: '机器分数与证据为预置演示数据，本工作台未实际调用模型评测。' },
    imported: { key: 'imported', label: '外部结果导入', description: '机器结果由外部导入，本工作台未执行此次评测；未提供的执行信息不作推测。' },
    repeat_review: { key: 'repeat_review', label: '复用旧机器结果', description: '本轮复用原有机器结果和图片进行人工复核，未重新生图或运行机器评测。' }
  };

  function isValidScore(score) { return VALID_SCORES.includes(score); }

  function selectMode(run) {
    const modeKey = ['imported', 'repeat_review'].includes(run.source) ? run.source : 'demo';
    return { ...MODE_DESCRIPTIONS[modeKey] };
  }

  function isNewerReview(candidate, previous) {
    const nextDate = Date.parse(candidate.saved_at || '');
    const previousDate = Date.parse(previous.saved_at || '');
    if (Number.isFinite(nextDate) && Number.isFinite(previousDate) && nextDate !== previousDate) return nextDate > previousDate;
    return (candidate.revision || 0) >= (previous.revision || 0);
  }

  function indexReviews({ run, samples, reviews }) {
    const sampleIds = new Set(samples.map(sample => sample.sample_id));
    const selectedReviews = new Map();
    reviews.forEach(review => {
      if (review.run_id !== run.run_id || !sampleIds.has(review.sample_id)) return;
      const previous = selectedReviews.get(review.sample_id);
      if (!previous || isNewerReview(review, previous)) selectedReviews.set(review.sample_id, review);
    });
    return selectedReviews;
  }

  function classifyMachine(sample, dimension) {
    if (!sample.applicable_dims.includes(dimension)) return { status: 'na', score: null, reason: '本题不适用，不计入评测分母。' };
    if (sample.machine_status === 'failed') return { status: 'failed', score: null, reason: '机器执行失败，现有分值不作为有效结果；当前仍全量人审。' };
    const score = sample.machine_scores?.[dimension];
    if (isValidScore(score)) return { status: 'completed', score, reason: '已有机器分数，是否正确仍需复核；当前仍全量人审。' };
    const reason = sample.machine_status === 'uncertain' ? '机器无法判断本维度' : '未提供合法的机器分数';
    return { status: 'uncertain', score: null, reason: `${reason}；当前仍全量人审。` };
  }

  function createItem({ run, sample, dimension, review }) {
    const machine = classifyMachine(sample, dimension);
    const applicable = machine.status !== 'na';
    return {
      key: JSON.stringify([run.run_id, sample.sample_id, dimension]), sample_id: sample.sample_id, dimension, applicable,
      machine_status: machine.status, machine_score: machine.score, reason: machine.reason,
      has_machine_result: machine.status === 'completed', needs_machine_fallback: applicable && machine.status !== 'completed',
      human_completed: applicable && isValidScore(review?.human_scores?.[dimension])
    };
  }

  function createSampleRow({ sample, items, reviewState, inputState }) {
    const applicableItems = items.filter(item => item.applicable);
    const humanCompleted = applicableItems.filter(item => item.human_completed).length;
    return {
      sample_id: sample.sample_id, category: sample.category, image_type: sample.image_type,
      applicable_count: applicableItems.length,
      machine_result_count: applicableItems.filter(item => item.has_machine_result).length,
      machine_missing_count: applicableItems.filter(item => !item.has_machine_result).length,
      fallback_count: applicableItems.filter(item => item.needs_machine_fallback).length,
      human_completed_count: humanCompleted,
      reviewed: applicableItems.length > 0 && humanCompleted === applicableItems.length,
      pending_adjudication: Boolean(reviewState?.pending_adjudication), adjudicated: Boolean(reviewState?.adjudicated),
      decision: reviewState?.decision || 'pending',
      inputs_ready: Boolean(inputState?.reference_ready && inputState?.generated_ready && inputState?.group_ready !== false),
      placeholder: Boolean(inputState?.placeholder)
    };
  }

  function calculateTotals(sampleRows) {
    const sumField = field => sampleRows.reduce((sum, row) => sum + row[field], 0);
    const countRows = matches => sampleRows.filter(matches).length;
    return {
      sample_count: sampleRows.length, applicable_items: sumField('applicable_count'),
      machine_result_items: sumField('machine_result_count'), machine_missing_items: sumField('machine_missing_count'),
      fallback_samples: countRows(row => row.fallback_count > 0),
      human_total_items: sumField('applicable_count'), human_completed_items: sumField('human_completed_count'),
      human_reviewed_samples: countRows(row => row.reviewed), pending_human_samples: countRows(row => !row.reviewed),
      adjudication_pending: countRows(row => row.pending_adjudication),
      adjudication_total: countRows(row => row.pending_adjudication || row.adjudicated),
      input_ready_samples: countRows(row => row.inputs_ready), placeholder_samples: countRows(row => row.placeholder)
    };
  }

  function getSnapshot({ run = {}, samples = [], reviews = [], reviewStates = [], inputStates = [] } = {}) {
    const selectedReviews = indexReviews({ run, samples, reviews });
    const indexedStates = new Map(reviewStates.map(record => [record.sample_id, record]));
    const indexedInputs = new Map(inputStates.map(record => [record.sample_id, record]));
    const items = []; const sampleRows = [];
    samples.forEach(sample => {
      const sampleItems = DIMENSION_CODES.map(dimension => createItem({ run, sample, dimension, review: selectedReviews.get(sample.sample_id) }));
      items.push(...sampleItems);
      sampleRows.push(createSampleRow({ sample, items: sampleItems, reviewState: indexedStates.get(sample.sample_id), inputState: indexedInputs.get(sample.sample_id) }));
    });
    return { mode: selectMode(run), items, sampleRows, totals: calculateTotals(sampleRows) };
  }

  return { getSnapshot };
})();
