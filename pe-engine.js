/* 本地 PE 六步引擎：纯数据运算，不访问页面、存储或网络。 */
window.PE_ENGINE = (() => {
  'use strict';
  const ENGINE_VERSION = 'pe-v2.0';
  const FIELD_LABELS = { subject: '主体', structure: '结构', material: '材质', environment: '环境', lighting: '光照', composition: '构图' };
  const PRIORITY = { default: 0, category: 10, fuzzy: 20, imagery: 30, explicit: 100, refinement: 110 };
  const REFINEMENT = { brightnessStep: 0.1, brightnessMin: 0.1, brightnessMax: 2, subjectStep: 10, subjectMin: 5, subjectMax: 95, initialSubjectRatio: 55 };
  const TYPE_ORDER = { A: 1, B: 2, C: 3, D: 4, E: 5 };
  const PRODUCT_PATTERN = /电蒸锅|电饭煲|电饭锅|空气炸锅|电烤箱|微波炉|电水壶|咖啡机|榨汁机|料理机|蒸锅|炒锅|煎锅|汤锅|锅|无线耳机|蓝牙耳机|耳机|手机|电脑|键盘|鼠标|音箱|相机|手表|精华液|精华|护肤霜|面霜|口红|香水|洗发水|护肤品|饮料|果汁|咖啡|牛奶|饼干|面包|食品|零食|运动鞋|鞋子|鞋|手提包|背包|包包|外套|衬衫|连衣裙|衣服|服饰|沙发|椅子|桌子|台灯|灯具|花瓶|水杯|杯子|收纳盒|玩具|风扇|感应器/gi;
  const PARAM_LABELS = { direction: '主光', softness: '光线', kelvin: '色温', contrast: '对比', brightness: '明度', depth: '景深', angle: '视角', ratio: '画幅', whitespace: '留白', subject_ratio: '主体占', subject_position: '主体位置', framing: '景别', saturation: '饱和度', tone: '色调', product_color: '商品颜色', max_colors: '配色不超过', finish: '表面', props_count: '道具数量', props_type: '道具材质', texture: '纹理', background: '背景' };
  const NEGATIVE_PREFIX = /(?:不要|别(?:加|用|要|做成)?|不(?:用|要|加|是|做)|禁止|避免|去掉|无)\s*(?:那么|那种|这种|任何|额外|添加|太|过于|很|左|右|纯|侧|前|后|顶部|大|小|用|\s){0,5}$/i;
  const cloneValue = value => JSON.parse(JSON.stringify(value));
  const joinText = values => [...new Set(values.filter(value => value !== '' && value != null))].join('；');
  const splitClauses = raw => raw.split(/[，,；;。\n]+|但是|不过|但/g).map(value => value.trim()).filter(Boolean);

  function createContext(raw, options) {
    return {
      version: ENGINE_VERSION, rulesVersion: window.PE_RULES.version, raw: String(raw).trim(), normalized: String(raw).trim(),
      requestedCategory: options.category || 'auto', category: '', segments: {}, params: {}, explicit: {}, sources: {},
      fragments: [], dropped: [], unknown: [], confidence: 1, reasons: [], warnings: [], manualFields: {},
      negatives: [], constraints: [], negativeClauses: [], excluded: [], completion: {}, trace: [],
      session: { history: [] }, result: null
    };
  }

  function isNegated(raw, index) {
    return NEGATIVE_PREFIX.test(raw.slice(Math.max(0, index - 12), index));
  }

  function findTrigger(raw, triggers, allowNegative = false) {
    const matches = triggers.flatMap(trigger => {
      const hits = []; let position = raw.toLowerCase().indexOf(trigger.toLowerCase());
      while (position >= 0) {
        if (allowNegative || !isNegated(raw, position)) hits.push({ hit: raw.slice(position, position + trigger.length), position });
        position = raw.toLowerCase().indexOf(trigger.toLowerCase(), position + trigger.length);
      }
      return hits;
    });
    return matches.sort((a, b) => a.position - b.position || b.hit.length - a.hit.length)[0];
  }

  function setParam(ctx, path, value, origin) {
    const [group, key] = path.split('.');
    if (value == null || !key || violatesExclusion(ctx, path, value)) return false;
    const existing = ctx.sources[path];
    const difference = existing ? PRIORITY[existing.source] - PRIORITY[origin.source] : -1;
    if (difference > 0 || (difference === 0 && (origin.source !== 'explicit' || (existing.specificity ?? existing.hit.length) >= (origin.specificity ?? origin.hit.length)))) return false;
    ctx.params[group] ||= {}; ctx.params[group][key] = cloneValue(value);
    ctx.sources[path] = { ...origin };
    if (origin.source === 'explicit') ctx.explicit[path] = cloneValue(value);
    return true;
  }

  function mergeParams(ctx, params, origin) {
    const applied = {};
    Object.entries(params || {}).forEach(([group, entries]) => {
      Object.entries(entries || {}).forEach(([key, value]) => {
        if (setParam(ctx, `${group}.${key}`, value, origin)) { applied[group] ||= {}; applied[group][key] = value; }
      });
    });
    return applied;
  }

  function describeParam(key, value) {
    const formatted = Array.isArray(value) ? value.join('～') : value;
    if (key === 'brightness' && typeof value === 'number') return `明度为初始基准的 ${Math.round(value * 100)}%`;
    if (key === 'subject_ratio' || key === 'saturation') return `${PARAM_LABELS[key]} ${formatted}${String(formatted).includes('%') ? '' : '%'}`;
    if (key === 'kelvin') return `色温 ${formatted}K`;
    if (key === 'props_count') return `道具 ${formatted} 件`;
    if (key === 'max_colors') return `配色不超过 ${formatted} 色`;
    if (key === 'whitespace' && value === 'none') return '不留白，满版构图';
    return `${PARAM_LABELS[key] || key}：${formatted}`;
  }

  function describeParams(params) {
    return joinText(Object.values(params || {}).flatMap(entries => Object.entries(entries).map(([key, value]) => describeParam(key, value))));
  }

  function recordFragment(ctx, type, hit, applied) {
    if (applied) ctx.fragments.push({ type, hit, applied });
  }

  function extractSubject(ctx) {
    const products = [...ctx.raw.matchAll(PRODUCT_PATTERN)].filter(match => !isNegated(ctx.raw, match.index));
    if (!products.length) {
      const candidate = splitClauses(ctx.raw).find(clause => /仪器|设备|装置|工具|摆件|玩偶|配件|商品|产品/.test(clause) && !/不要|别加|禁止/.test(clause));
      if (candidate) {
        ctx.segments.subject = candidate.replace(/^(?:帮我|请|来个|来张|来一张|做个|画个)/, '').replace(/图$/, '').trim();
        ctx.subjectClause = candidate;
        ctx.explicit.subject = ctx.segments.subject;
        ctx.sources.subject = { source: 'explicit', hit: ctx.segments.subject };
      }
      return;
    }
    const first = products[0];
    ctx.subjectClause = ctx.raw.slice(0, first.index).split(/[，,；;。\n]+|但是|不过|但/g).at(-1) + ctx.raw.slice(first.index).split(/[，,；;。\n]+|但是|不过|但/g)[0];
    const prefix = ctx.raw.slice(Math.max(0, first.index - 14), first.index);
    const quantity = prefix.match(/([一二三四五六七八九十两\d]+\s*(?:台|个|件|瓶|只|套|双|袋|盒|杯|支|条|把))[^，,；;。\n]{0,12}$/);
    ctx.segments.subject = `${quantity ? quantity[1] : ''}${first[0]}`;
    ctx.explicit.subject = ctx.segments.subject;
    ctx.sources.subject = { source: 'explicit', hit: ctx.segments.subject };
  }

  function extractProductDetails(ctx) {
    const materialWords = ctx.raw.match(/不锈钢|铝合金|玻璃|皮革|陶瓷|塑料|金属|木质|棉麻|丝绸|拉丝|磨砂|抛光|镜面|304|316/g) || [];
    const positiveMaterials = materialWords.filter(word => findTrigger(ctx.raw, [word]));
    if (positiveMaterials.length) ctx.segments.material = joinText(positiveMaterials);
    const structural = splitClauses(ctx.raw).filter(clause => /层数|[一二三四五六七八九十两\d]+层|按键|按钮|控制面板|把手|旋钮|瓶盖|瓶口|肩带|接口|通风孔|开盖/.test(clause));
    if (structural.length) ctx.segments.structure = joinText(structural);
    const finish = findTrigger(ctx.raw, ['拉丝', '磨砂', '抛光', '镜面', '哑光', '亮面']);
    if (finish) setParam(ctx, 'material.finish', finish.hit, { source: 'explicit', hit: finish.hit });
    const subjectClause = ctx.subjectClause;
    const productColor = subjectClause?.match(/银色|红色|黑色|白色|蓝色|绿色|金色|米白|奶白|深灰|浅灰|粉色/);
    if (productColor && !/背景|白底|黑底/.test(subjectClause.slice(Math.max(0, productColor.index - 2), productColor.index + 6))) {
      setParam(ctx, 'color.product_color', productColor[0], { source: 'explicit', hit: productColor[0] });
    }
  }

  function stepTerminology(ctx, rules) {
    extractSubject(ctx);
    Object.entries(rules.terminology).forEach(([group, entries]) => entries.forEach(item => {
      const found = findTrigger(ctx.raw, item.triggers);
      if (!found) return;
      ctx.normalized = ctx.normalized.split(found.hit).join(item.target);
      const path = item.path || `${group === 'lighting' ? 'light' : group}.${group === 'color' ? 'tone' : 'finish'}`;
      setParam(ctx, path, item.value ?? item.target, { source: 'explicit', hit: found.hit });
      recordFragment(ctx, 'terminology', found.hit, item.target);
    }));
    extractProductDetails(ctx);
  }

  function extractNumericParams(ctx) {
    const ratios = [...ctx.raw.matchAll(/(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/g)].filter(match => !isNegated(ctx.raw, match.index));
    if (ratios.length) {
      const ratio = ratios[0]; const valid = Number(ratio[1]) > 0 && Number(ratio[2]) > 0;
      setParam(ctx, 'composition.ratio', valid ? `${ratio[1]}:${ratio[2]}` : '待确认（比例必须大于零）', { source: 'explicit', hit: ratio[0], specificity: 100 });
      if (!valid || new Set(ratios.map(match => `${match[1]}:${match[2]}`)).size > 1) ctx.warnings.push('画幅比例无效或给了多个不同数值，请保留本次需要的一个比例。');
    }
    const percentage = ctx.raw.match(/(?:主体|商品|占比)[^，,；;。\n]{0,10}?(\d+(?:\.\d+)?)\s*[%％]/);
    if (percentage) {
      setParam(ctx, 'composition.subject_ratio', Number(percentage[1]), { source: 'explicit', hit: percentage[0], specificity: 100 });
      if (Number(percentage[1]) > 100 || Number(percentage[1]) <= 0) ctx.warnings.push('主体占比应在 0% 到 100% 之间，请核对。');
    }
    const kelvin = ctx.raw.match(/(\d{3,5})\s*K\b/i);
    if (kelvin && !isNegated(ctx.raw, kelvin.index)) setParam(ctx, 'light.kelvin', Number(kelvin[1]), { source: 'explicit', hit: kelvin[0], specificity: 100 });
  }

  function extractLayoutParams(ctx, rules) {
    extractNumericParams(ctx);
    Object.entries(rules.explicit).forEach(([key, entries]) => {
      const hits = entries.flatMap(item => { const match = findTrigger(ctx.raw, item.triggers, key === 'whitespace'); return match ? [{ ...match, value: item.value }] : []; });
      hits.sort((a, b) => b.hit.length - a.hit.length || a.position - b.position);
      if (hits[0]) setParam(ctx, `composition.${key}`, hits[0].value, { source: 'explicit', hit: hits[0].hit });
    });
    Object.entries(ctx.explicit).filter(([path]) => path.startsWith('composition.')).forEach(([path, value]) => recordFragment(ctx, 'explicit', ctx.sources[path].hit, describeParam(path.split('.')[1], value)));
    const orientation = findTrigger(ctx.raw, ['横版', '横幅', '横图', '竖版', '竖屏', '竖图']);
    const ratio = String(ctx.params.composition?.ratio || '').split(':').map(Number);
    if (orientation && ratio.length === 2 && ((/横/.test(orientation.hit) && ratio[0] < ratio[1]) || (/竖/.test(orientation.hit) && ratio[0] > ratio[1]))) ctx.warnings.push('横竖方向与数值比例不一致，请确认以哪一个为准。');
  }

  function extractSceneParams(ctx) {
    const scene = findTrigger(ctx.raw, ['纯白背景', '纯白底', '纯白', '白底', '黑色背景', '纯黑背景', '黑底', '浅灰背景', '灰底', '厨房背景', '厨房', '梳妆台', '客厅', '户外', '草地', '桌面', '台面']);
    if (scene) setParam(ctx, 'environment.background', /白/.test(scene.hit) ? '纯白无缝背景' : scene.hit, { source: 'explicit', hit: scene.hit });
    const qualified = [...ctx.raw.matchAll(/(?:左|右)(?:侧|边|上方|下方)?(?:窗光|冷光|暖光|硬光|柔光|自然光|光)/g)].find(match => !isNegated(ctx.raw, match.index));
    const directions = qualified ? { hit: qualified[0] } : findTrigger(ctx.raw, ['侧逆光', '侧光', '逆光', '顶光', '正面光', '自然光']);
    if (directions) setParam(ctx, 'light.direction', directions.hit, { source: 'explicit', hit: directions.hit });
    const softness = findTrigger(ctx.raw, ['柔光', '柔和', '硬光', '硬阴影']);
    if (softness) setParam(ctx, 'light.softness', softness.hit, { source: 'explicit', hit: softness.hit });
    const tone = findTrigger(ctx.raw, ['暖光', '暖色调', '暖调', '冷光', '冷色调', '冷调']);
    if (tone) setParam(ctx, 'color.tone', tone.hit, { source: 'explicit', hit: tone.hit });
    const angle = findTrigger(ctx.raw, ['正俯拍', '俯拍', '俯视', '平视', '仰视', '正面45°', '正面 45°']);
    if (angle) setParam(ctx, 'composition.angle', angle.hit, { source: 'explicit', hit: angle.hit });
    const noProps = findTrigger(ctx.raw, ['不要道具', '无道具', '不加道具', '不要任何道具'], true);
    if (noProps) setParam(ctx, 'material.props_count', 0, { source: 'explicit', hit: noProps.hit });
  }

  function applyMapping(ctx, item, type, priority) {
    const hit = findTrigger(ctx.raw, item.triggers, Boolean(item.allowNegative));
    if (!hit) return;
    if (type === 'fuzzy' && ctx.rejectedStyleSpans?.some(span => hit.position >= span.position && hit.position < span.position + span.hit.length)) return;
    if (!Object.keys(item.params || {}).length) {
      const message = '这句需要上一轮的明确参数；请在现有结果下使用纠偏按钮，或补充完整商品指令。';
      ctx.warnings.push(message); recordFragment(ctx, type, hit.hit, message); return;
    }
    const applied = mergeParams(ctx, item.params, { source: priority, hit: hit.hit });
    recordFragment(ctx, type, hit.hit, describeParams(applied) || item.fragment);
  }

  function stepFuzzy(ctx, rules) {
    extractLayoutParams(ctx, rules); extractSceneParams(ctx);
    ctx.rejectedStyleSpans = planImagery(ctx.raw, rules).rejected.map(({ hit, position }) => ({ hit, position }));
    rules.fuzzy.subjective.forEach(item => applyMapping(ctx, item, 'fuzzy', 'fuzzy'));
    rules.fuzzy.relative.forEach(item => applyMapping(ctx, item, 'fuzzy', 'fuzzy'));
    applyDegree(ctx, rules);
  }

  function applyDegree(ctx, rules) {
    const words = Object.keys(rules.fuzzy.degree).sort((a, b) => b.length - a.length).join('|');
    const pattern = new RegExp(`(${words})(亮|暗|大|小|淡)|(亮|暗|大|小|淡)(${words})`, 'g');
    for (const match of ctx.raw.matchAll(pattern)) {
      if (isNegated(ctx.raw, match.index)) continue;
      const degree = rules.fuzzy.degree[match[1] || match[4]]; const axis = match[2] || match[3];
      let path; let value;
      if (axis === '亮' || axis === '暗') { path = 'light.brightness'; value = 1 + (axis === '亮' ? degree : -degree); }
      else if (axis === '大' || axis === '小') {
        path = 'composition.subject_ratio';
        value = Math.max(5, Math.min(95, midpoint(ctx.params.composition?.subject_ratio, 55) + (axis === '大' ? degree : -degree) * 100));
      } else { path = 'color.saturation'; value = midpoint(ctx.params.color?.saturation, 50) * (1 - degree); }
      setParam(ctx, path, value, { source: 'explicit', hit: match[0], specificity: 110 });
      recordFragment(ctx, 'fuzzy', match[0], describeParam(path.split('.')[1], value));
      if (degree >= 0.4) ctx.warnings.push('调整幅度较大，请用实际生成图确认细节和色彩。');
    }
  }

  function violatesExclusion(ctx, path, value) {
    const literal = String(value);
    return (ctx.excluded || []).some(excluded => {
      if (/木头|木质/.test(excluded) && /material|environment/.test(path) && /木/.test(literal)) return true;
      if (/玻璃/.test(excluded) && /material/.test(path) && /玻璃/.test(literal)) return true;
      if (/厨房/.test(excluded) && path === 'environment.background' && /厨房/.test(literal)) return true;
      if (/亮面|镜面/.test(excluded) && path === 'material.finish' && /亮面|抛光|镜面/.test(literal)) return true;
      if (/道具/.test(excluded) && path === 'material.props_type' && !/无道具/.test(literal)) return true;
      return false;
    });
  }

  function removeExcludedParams(ctx) {
    Object.entries(ctx.params).forEach(([group, entries]) => Object.entries(entries).forEach(([key, value]) => {
      const path = `${group}.${key}`;
      if (violatesExclusion(ctx, path, value)) { delete entries[key]; delete ctx.sources[path]; delete ctx.explicit[path]; }
    }));
  }

  function planImagery(raw, rules) {
    const hits = rules.imagery.flatMap(rule => { const hit = findTrigger(raw, rule.triggers); return hit ? [{ rule, ...hit }] : []; });
    hits.sort((a, b) => TYPE_ORDER[a.rule.type] - TYPE_ORDER[b.rule.type] || a.position - b.position || b.hit.length - a.hit.length);
    const kept = []; const rejected = [];
    hits.forEach(hit => {
      const conflict = kept.find(other => hit.rule.conflicts_with.includes(other.rule.id) || other.rule.conflicts_with.includes(hit.rule.id));
      if (conflict) { rejected.push({ ...hit, kept: conflict.rule.canonical }); return; }
      if (kept.some(other => hit.position >= other.position && hit.position + hit.hit.length <= other.position + other.hit.length)) return;
      kept.push(hit);
    });
    return { kept, rejected };
  }

  function stepImagery(ctx, rules) {
    const plan = planImagery(ctx.raw, rules);
    ctx.dropped = plan.rejected.map(hit => ({ name: hit.rule.canonical, kept: hit.kept }));
    plan.kept.forEach(hit => {
      const applied = mergeParams(ctx, hit.rule.params, { source: 'imagery', hit: hit.hit });
      recordFragment(ctx, 'imagery', hit.hit, describeParams(applied));
    });
    detectUnknown(ctx, rules);
  }

  function detectUnknown(ctx, rules) {
    const known = [...rules.imagery, ...rules.fuzzy.subjective, ...rules.fuzzy.relative, ...Object.values(rules.terminology).flat()].flatMap(rule => rule.triggers);
    let remaining = ctx.raw;
    known.sort((a, b) => b.length - a.length).forEach(term => { remaining = remaining.split(term).join(''); });
    remaining = remaining.replace(/风扇|通风孔|通风|感应器|感应|质感|光感|触感|手感|不要|别加|纯白背景|白底/g, '');
    const hintPattern = /[\u4e00-\u9fffA-Za-z]{1,10}(?:风格|感觉|风|感)|像[\u4e00-\u9fffA-Za-z]{2,12}|[\u4e00-\u9fffA-Za-z]{2,10}那种/g;
    const phrases = splitClauses(remaining).filter(clause => rules.imagery_hints.some(hint => clause.includes(hint))).flatMap(clause => [...clause.matchAll(hintPattern)].map(match => match[0]));
    ctx.unknown = [...new Set(phrases.filter(phrase => phrase.length > 1))];
  }

  function stepNegation(ctx, rules) {
    rules.negation.forEach(item => {
      const hit = findTrigger(ctx.raw, item.triggers, true);
      if (!hit) return;
      mergeParams(ctx, item.params, { source: 'explicit', hit: hit.hit });
      ctx.negatives.push(...item.negative); ctx.negativeClauses.push(item.positive);
      recordFragment(ctx, 'negation', hit.hit, item.positive);
    });
    const excluded = [...ctx.raw.matchAll(/(?:不要|别加|不加|禁止|避免)([^，,；;。\n]+)/g)];
    excluded.forEach(match => {
      ctx.excluded.push(match[1].trim());
      if (rules.negation.some(item => item.triggers.some(trigger => match[0].includes(trigger)))) return;
      ctx.negativeClauses.push(`排除：${match[1].trim()}`);
    });
    removeExcludedParams(ctx);
    if (ctx.excluded.some(value => /厨房/.test(value))) {
      setParam(ctx, 'environment.background', '纯色摄影背景', { source: 'explicit', hit: '不要厨房' });
    }
    if (/不要人|无人物/.test(ctx.raw) && /手(?:拿|持)|露.{0,3}手/.test(ctx.raw)) ctx.warnings.push('“无人物”与“手持或露手”同时出现，请确认是否允许手部入画。');
    if (/不要(?:ins|日系|北欧|赛博)/i.test(ctx.raw)) recordFragment(ctx, 'negation', '排除风格', '已跳过被明确排除的风格，不采用其默认参数');
  }

  function stepCompletion(ctx, rules) {
    const inferred = Object.entries(rules.completion).find(([, defaults]) => findTrigger(ctx.segments.subject || '', defaults.triggers));
    ctx.category = Object.hasOwn(rules.completion, ctx.requestedCategory) ? ctx.requestedCategory : inferred?.[0] || '';
    const defaults = rules.completion[ctx.category];
    if (defaults) {
      ctx.completion = { structure: defaults.structure, material: defaults.material };
      const applied = mergeParams(ctx, defaults.params, { source: 'category', hit: ctx.category });
      recordFragment(ctx, 'completion', ctx.category, describeParams(applied));
    }
    setParam(ctx, 'light.direction', '左侧自然光', { source: 'default', hit: '默认光线' });
    setParam(ctx, 'light.softness', '柔和', { source: 'default', hit: '默认光线' });
    setParam(ctx, 'light.brightness', 1, { source: 'default', hit: '初始明度基准' });
  }

  function stepGuardrail(ctx, rules) {
    const defaults = Object.fromEntries(Object.entries(rules.guardrail.defaults).map(([key, value]) => [key, value]));
    mergeParams(ctx, { composition: defaults }, { source: 'default', hit: '兜底默认' });
    ctx.constraints = [...rules.guardrail.hard.constraints];
    rules.guardrail.conditional.forEach(rule => {
      const yielding = findTrigger(ctx.raw, rule.yield_to);
      if (!yielding && !(rule.id === 'safe_margin' && ctx.params.composition.whitespace === 'none')) ctx.constraints.push(rule.text);
      else recordFragment(ctx, 'guardrail', yielding?.hit || '满版', `本次不强制${rule.text}`);
    });
    ctx.constraints.push(...ctx.negativeClauses);
    ctx.negatives = [...new Set([...ctx.negatives, ...rules.guardrail.hard.negatives])];
    if (/加.{0,4}(?:文字|logo|水印)|双主光/i.test(ctx.raw) && !/不要|不加|别加/.test(ctx.raw)) {
      ctx.warnings.push(rules.guardrail.hard.message_on_conflict);
      recordFragment(ctx, 'guardrail', '与固定约束冲突', rules.guardrail.hard.message_on_conflict);
    }
  }

  function calculateConfidence(ctx) {
    let score = 1;
    if (!ctx.segments.subject) { score -= 0.3; ctx.reasons.push('还没有明确商品名称。'); }
    if (ctx.raw.length < 6 && !ctx.segments.subject) { score -= 0.4; ctx.reasons.push('输入太短，需要补充主体和用途。'); }
    if (ctx.unknown.length) { score -= 0.25 * ctx.unknown.length; ctx.reasons.push(`以下说法未入规则库：${ctx.unknown.join('、')}。`); }
    if (ctx.dropped.length) { score -= 0.2; ctx.reasons.push('风格有冲突，本次保留优先命中的风格。'); }
    if (ctx.warnings.length) { score -= 0.2; ctx.reasons.push(...ctx.warnings); }
    return Math.max(0, Math.min(1, Number(score.toFixed(2))));
  }

  function buildMaterial(ctx) {
    const material = ctx.params.material || {};
    const attributes = ['finish', 'texture'].filter(key => material[key] != null).map(key => describeParam(key, material[key]));
    return joinText([ctx.segments.material || ctx.completion.material || '商品实际材质待确认，不擅自指定材质', ...attributes]);
  }

  function buildEnvironment(ctx) {
    const material = ctx.params.material || {};
    const props = material.props_count;
    return joinText([ctx.params.environment?.background || '简洁纯色摄影背景', props === 0 ? '不添加道具' : props != null ? `道具 ${Array.isArray(props) ? props.join('～') : props} 件${material.props_type ? `，${material.props_type}` : ''}` : '不额外添加道具']);
  }

  function assemble(ctx) {
    const segments = {
      subject: ctx.segments.subject || '待补充商品名称',
      structure: ctx.segments.structure || ctx.completion.structure || '结构、部件数量与位置按实际商品确认，不擅自增减',
      material: buildMaterial(ctx), environment: buildEnvironment(ctx),
      lighting: describeParams({ light: ctx.params.light }),
      composition: describeParams({ composition: ctx.params.composition, color: ctx.params.color || {} })
    };
    Object.assign(segments, ctx.manualFields);
    const occupancy = ctx.manualFields.composition ? '' : describeParam('subject_ratio', ctx.params.composition.subject_ratio);
    const constraints = joinText([...ctx.constraints, occupancy]);
    const negatives = [...ctx.negatives];
    const prompt = `${Object.entries(FIELD_LABELS).map(([key, label]) => `${label}：${segments[key]}`).join('\n')}\n【系统约束】${constraints}\n【负面提示】${negatives.join(', ')}`;
    ctx.result = { segments, constraints, negatives, prompt, summary: '' };
    ctx.result.summary = summary(ctx);
    return ctx;
  }

  function summary(ctx) {
    if (!ctx.result) return '';
    const composition = ctx.params.composition || {}; const light = ctx.params.light || {};
    return [ctx.manualFields.environment ? '环境已手动编辑' : ctx.params.environment?.background || '背景待确认', ctx.manualFields.composition ? '构图已手动编辑' : describeParam('subject_ratio', composition.subject_ratio ?? '待确认'),
      ctx.manualFields.lighting ? '光照已手动编辑' : joinText([light.softness, light.direction]),
      ctx.manualFields.material ? '材质已手动编辑' : ctx.params.material?.finish || ctx.segments.material || (composition.ratio ? `${composition.ratio} 画幅` : '材质待确认')].join(' · ');
  }

  function run(raw, options = {}) {
    const ctx = createContext(raw, options); const rules = window.PE_RULES;
    const steps = { terminology: stepTerminology, fuzzy: stepFuzzy, imagery: stepImagery, negation: stepNegation, completion: stepCompletion, guardrail: stepGuardrail };
    rules.pipeline.forEach(name => { steps[name](ctx, rules); ctx.trace.push(name); });
    ctx.confidence = calculateConfidence(ctx);
    return assemble(ctx);
  }

  function midpoint(value, fallback) {
    if (Array.isArray(value)) return value.reduce((sum, number) => sum + Number(number), 0) / value.length;
    if (typeof value === 'number') return value;
    const numbers = String(value || '').match(/\d+(?:\.\d+)?/g);
    return numbers ? numbers.map(Number).reduce((sum, number) => sum + number, 0) / numbers.length : fallback;
  }

  function refine(context, key) {
    const next = cloneValue(context);
    const field = ['darker', 'brighter'].includes(key) ? 'lighting' : ['bigger', 'smaller', 'less_busy'].includes(key) ? 'composition' : '';
    if (!field) return next;
    if (next.manualFields[field]) { next.warnings = [...new Set([...next.warnings, `${FIELD_LABELS[field]}已手动编辑，请直接修改该段，避免覆盖你的文字。`])]; return next; }
    if (key === 'darker' || key === 'brighter') {
      const factor = 1 + (key === 'darker' ? -REFINEMENT.brightnessStep : REFINEMENT.brightnessStep);
      next.params.light.brightness = Number(Math.min(REFINEMENT.brightnessMax, Math.max(REFINEMENT.brightnessMin, (next.params.light.brightness ?? 1) * factor)).toFixed(4));
      next.sources['light.brightness'] = { source: 'refinement', hit: key === 'darker' ? '太亮了' : '太暗了' };
    } else if (key === 'bigger' || key === 'smaller') {
      next.params.composition.subject_ratio = Math.max(REFINEMENT.subjectMin, Math.min(REFINEMENT.subjectMax, midpoint(next.params.composition.subject_ratio, REFINEMENT.initialSubjectRatio) + (key === 'bigger' ? REFINEMENT.subjectStep : -REFINEMENT.subjectStep)));
      next.sources['composition.subject_ratio'] = { source: 'refinement', hit: key === 'bigger' ? '主体太小' : '主体太大' };
    } else {
      next.params.color ||= {}; next.params.color.max_colors = 3;
      next.sources['color.max_colors'] = { source: 'refinement', hit: '太花了' };
    }
    recordFragment(next, 'refinement', key, '只调整本次选中的参数，保留其余参数与手动文字');
    return assemble(next);
  }

  function edit(context, field, text) {
    const next = cloneValue(context);
    if (!Object.hasOwn(FIELD_LABELS, field)) return next;
    next.manualFields[field] = String(text);
    return assemble(next);
  }

  function check(ctx) {
    const warnings = [...ctx.warnings];
    const fieldMap = { composition: 'composition', light: 'lighting', color: 'composition', material: 'material', environment: 'environment', subject: 'subject' };
    Object.entries(ctx.explicit).forEach(([path, value]) => {
      const field = fieldMap[path.split('.')[0]];
      if (ctx.manualFields[field] && !ctx.manualFields[field].includes(String(value))) warnings.push(`请核对手改后的${FIELD_LABELS[field]}是否保留“${ctx.sources[path]?.hit || value}”。`);
    });
    return [...new Set(warnings)];
  }

  function serialize(context) { return context.result.prompt; }

  return { run, refine, edit, serialize, check, summary };
})();
