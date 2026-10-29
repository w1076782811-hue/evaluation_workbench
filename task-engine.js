/* 任务范围与进度的纯计算；页面、存储与时钟由调用方负责。 */
window.TASK_ENGINE = (() => {
  'use strict';
  const PERCENT_SCALE = 100;
  const EMPTY_SCOPE = { categories: [], image_types: [], limit: null };
  const REQUIRED_FIELDS = ['task_id', 'run_id', 'name', 'created_at'];
  const LIFECYCLE_DATES = ['started_at', 'finished_at'];
  const TASK_FLAGS = ['paused', 'archived'];

  function normalizeScope(scope = {}) {
    const categories = Array.isArray(scope.categories) ? [...scope.categories] : [];
    const imageTypes = Array.isArray(scope.image_types) ? [...scope.image_types] : [];
    const limit = scope.limit == null ? null : scope.limit;
    return { categories, image_types: imageTypes, limit };
  }

  function normalizeTask(task = {}) {
    const { status, done, ...fields } = task;
    return {
      task_id: '', run_id: '', name: '', assignee: '', note: '', created_at: null,
      started_at: null, finished_at: null, paused: false, archived: false,
      ...fields, scope: normalizeScope(task.scope || EMPTY_SCOPE)
    };
  }

  function validateScope(scope) {
    if (scope == null) return;
    if (typeof scope !== 'object' || Array.isArray(scope)) throw new TypeError('任务范围必须是对象。');
    ['categories', 'image_types'].forEach(key => {
      if (scope[key] !== undefined && (!Array.isArray(scope[key]) || scope[key].some(value => typeof value !== 'string' || !value.trim()))) {
        throw new TypeError('任务品类与图型范围必须是非空文字组成的数组。');
      }
    });
    if (scope.limit != null && (!Number.isInteger(scope.limit) || scope.limit < 0)) throw new TypeError('任务题量上限必须是非负整数或留空。');
  }

  function validateTaskFields(options) {
    REQUIRED_FIELDS.forEach(key => {
      if (typeof options[key] !== 'string' || !options[key].trim()) throw new TypeError(`创建任务缺少有效字段：${key}。`);
    });
    if (!Number.isFinite(Date.parse(options.created_at))) throw new TypeError('任务创建时间无效。');
    ['assignee', 'note'].forEach(key => {
      if (options[key] !== undefined && typeof options[key] !== 'string') throw new TypeError('任务负责人和说明必须是文字。');
    });
    LIFECYCLE_DATES.forEach(key => {
      if (options[key] != null && (typeof options[key] !== 'string' || !Number.isFinite(Date.parse(options[key])))) throw new TypeError(`任务时间无效：${key}。`);
    });
    TASK_FLAGS.forEach(key => {
      if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new TypeError('任务暂停和归档标记必须是布尔值。');
    });
    validateScope(options.scope);
  }

  function createTask(options) {
    validateTaskFields(options);
    return normalizeTask({ ...options, name: options.name.trim() });
  }

  function getSamples(task, samples) {
    const scope = normalizeScope(task.scope || EMPTY_SCOPE);
    const filtered = samples.filter(sample =>
      (!scope.categories.length || scope.categories.includes(sample.category)) &&
      (!scope.image_types.length || scope.image_types.includes(sample.image_type))
    );
    return scope.limit === null ? filtered : filtered.slice(0, scope.limit);
  }

  function getReviewRank(review) {
    const savedAt = Date.parse(review.saved_at || '');
    return { savedAt: Number.isFinite(savedAt) ? savedAt : null, revision: Number.isInteger(review.revision) ? review.revision : 0 };
  }

  function isNewerReview(candidate, previous) {
    const nextRank = getReviewRank(candidate); const oldRank = getReviewRank(previous);
    if (nextRank.savedAt !== null && oldRank.savedAt !== null && nextRank.savedAt !== oldRank.savedAt) return nextRank.savedAt > oldRank.savedAt;
    return nextRank.revision >= oldRank.revision;
  }

  function getScopedReviews({ task, samples, reviews }) {
    const sampleIds = new Set(samples.map(sample => sample.sample_id));
    const selected = new Map();
    reviews.forEach(review => {
      if (review.run_id !== task.run_id || !sampleIds.has(review.sample_id)) return;
      const previous = selected.get(review.sample_id);
      if (!previous || isNewerReview(review, previous)) selected.set(review.sample_id, review);
    });
    return selected;
  }

  function calculateStatus({ task, total, reviewed }) {
    if (!total) return 'draft';
    if (reviewed === total) return 'done';
    if (task.paused) return 'paused';
    return task.started_at ? 'running' : 'ready';
  }

  function calculatePercent(reviewed, total) {
    return total ? reviewed / total * PERCENT_SCALE : 0;
  }

  function getCategoryProgress(samples, reviewedIds) {
    const categories = [...new Set(samples.map(sample => sample.category))];
    return categories.map(category => {
      const categorySamples = samples.filter(sample => sample.category === category);
      const reviewed = categorySamples.filter(sample => reviewedIds.has(sample.sample_id)).length;
      const total = categorySamples.length;
      return { category, total, reviewed, percent: calculatePercent(reviewed, total) };
    });
  }

  function getTiming(scopedReviews, pending) {
    const timedReviews = [...scopedReviews.values()].filter(review => Number.isFinite(review.elapsed_ms) && review.elapsed_ms > 0);
    const elapsedMs = timedReviews.reduce((sum, review) => sum + review.elapsed_ms, 0);
    return {
      elapsed_ms: elapsedMs,
      estimated_remaining_ms: pending && timedReviews.length ? Math.round(elapsedMs / timedReviews.length * pending) : null
    };
  }

  function getProgress({ task, samples, reviews }) {
    const selectedSamples = getSamples(task, samples);
    const scopedReviews = getScopedReviews({ task, samples: selectedSamples, reviews });
    const total = selectedSamples.length; const reviewed = scopedReviews.size; const pending = total - reviewed;
    const reviewedIds = new Set(scopedReviews.keys());
    return {
      total, reviewed, pending, percent: calculatePercent(reviewed, total),
      status: calculateStatus({ task, total, reviewed }),
      ...getTiming(scopedReviews, pending),
      by_category: getCategoryProgress(selectedSamples, reviewedIds),
      sample_ids: selectedSamples.map(sample => sample.sample_id),
      pending_ids: selectedSamples.filter(sample => !reviewedIds.has(sample.sample_id)).map(sample => sample.sample_id)
    };
  }

  function getStatus(options) { return getProgress(options).status; }

  return { getSamples, getProgress, createTask, normalizeTask, getStatus };
})();
