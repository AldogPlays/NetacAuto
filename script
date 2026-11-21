// ==UserScript==
// @name         Course Helper — Local
// @description  Local answer hints and optional assistance for visible course activities.
// @namespace    netacad-local
// @version      3.0.5
// @author       NetacAuto contributors; original script by byOscar (ByOscarPINE)
// @license      GPLv3
// @match        https://www.netacad.com/*
// @grant        none
// @run-at       document-start
// @allFrames    true
// @downloadURL  none
// @updateURL    none
// ==/UserScript==

// SPDX-License-Identifier: GPL-3.0-only
// Modified fork maintained by NetacAuto contributors; see NOTICE.txt for attribution.

(function () {
    'use strict';
    const STORAGE_KEY = 'course-helper.preferences.v2';
    const HOST_ID = 'course-helper-panel';
    const defaults = { hints:false, color:'#4579f2', theme:'system', paced:true, submit:false,
        navigate:true, labs:false, connectionFocus:true, position:null };
    const components = new Map();
    const watchedRoots = new WeakSet();
    const visited = new WeakSet();
    const opaqueSelections = new WeakMap();
    const downloaded = new Set();
    const soughtMedia = new WeakSet();
    const mediaPlayback = new WeakMap();
    const animationPlayback = new WeakMap();
    const assessmentStarts = new WeakMap();
    const tabStates = new WeakMap();
    const activePairs = new Map();
    const highlighted = new Set();
    const pendingQuestions = new Set();
    const submittedSignatures = new WeakMap();
    const submittedAssessmentContexts = new WeakMap();
    const navigationSignatures = new WeakMap();
    let activityStatus = null;
    const navigationTrace = {lastDecision:null,lastClick:null};
    const outlineRecoveryAttempts = new Set();
    let pendingDropdown = null;
    const RESUME_KEY = 'course-helper.next-page';
    const AUTO_SESSION_KEY = 'course-helper.auto-session';
    const CONTROL_SELECTOR = 'label,button,[role="button"],[role="radio"],[role="checkbox"],[tabindex="0"]';
    const DROPDOWN_SELECTOR = '[role=combobox],[aria-haspopup=listbox],button.js-dropdown-btn';
    let preferences = readPreferences();
    let panel, status, observerTimer, autoTimer, running = false, automatic = false, generation = 0;
    let domReads = null;
    const plainCache = new Map();
    const readStats = { passes:0,last:null,slowest:null };
    const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
    const helperStarted = now();
    const diagnostics = {recent:[],slowReads:[],counters:{refreshRequests:0,refreshes:0,mutationCallbacks:0,
        mutationRecords:0,ignoredMutationBatches:0,autoTicks:0},capture:null,pause:null,discovery:null,lastControlError:null};
    let controlFailures = 0;
    let refreshSuspended = false, captureTimer = null, capturePulse = null, longTaskObserver = null;
    const READ_BUDGET_MS = 250;
    const DISCOVERY_BATCH_SIZE = 8;
    const DISCOVERY_SLICE_MS = 12;

    function boundedPush(list,value,limit = 30) {
        list.push(value); if (list.length > limit) list.splice(0,list.length-limit);
    }

    function performancePause(sample) {
        automatic = false; generation++; refreshSuspended = true;
        saveAutoSession('paused');
        clearTimeout(autoTimer); clearTimeout(observerTimer); observerTimer = null;
        // Keep the lightweight report reachable if initial response processing
        // overruns before the normal panel/observer refresh has run.
        if (!panel && document.body) mountPanel();
        else if (!panel) document.addEventListener('DOMContentLoaded',() => {
            if (!panel && document.body) mountPanel();
        },{once:true});
        diagnostics.pause = {at:new Date().toISOString(),operation:sample.operation,milliseconds:sample.milliseconds};
        say('Performance pause: '+sample.operation+' took '+sample.milliseconds+' ms. Copy Performance report; Start auto retries.');
        syncButtons();
    }

    function checkReadBudget() {
        if (domReads && now() > domReads.deadline) {
            const error = new Error('Helper synchronous scan exceeded '+READ_BUDGET_MS+' ms.');
            error.name = 'HelperScanBudgetExceeded'; throw error;
        }
    }

    function performanceReport() {
        return {version:'3.0.5',generatedAt:new Date().toISOString(),automatic,refreshSuspended,
            uptimeMilliseconds:Math.round(now()-helperStarted),
            retainedComponents:components.size,visibility:document.visibilityState || 'visible',
            readPerformance:{...readStats},counters:{...diagnostics.counters},pause:diagnostics.pause,
            recent:diagnostics.recent.slice(),slowReads:diagnostics.slowReads.slice(),capture:diagnostics.capture,
            discovery:diagnostics.discovery ? {...diagnostics.discovery} : null,
            autoSession:readAutoSession(),controlRetries:controlFailures,
            lastControlError:diagnostics.lastControlError ? {...diagnostics.lastControlError} : null};
    }

    function stopPerformanceCapture() {
        clearTimeout(captureTimer); clearTimeout(capturePulse); longTaskObserver?.disconnect();
        captureTimer = capturePulse = null; longTaskObserver = null;
        if (diagnostics.capture && !diagnostics.capture.endedAt) diagnostics.capture.endedAt = new Date().toISOString();
    }

    function startPerformanceCapture() {
        stopPerformanceCapture();
        diagnostics.capture = {startedAt:new Date().toISOString(),endedAt:null,longTasks:[],eventLoopDelays:[],slowQueries:[],
            longTaskSupport:typeof PerformanceObserver !== 'undefined'};
        const capture = diagnostics.capture;
        if (typeof PerformanceObserver !== 'undefined') {
            try {
                longTaskObserver = new PerformanceObserver(list => {
                    for (const entry of list.getEntries()) boundedPush(capture.longTasks,
                        {startTime:Math.round(entry.startTime),milliseconds:Math.round(entry.duration),
                            overlappingHelperReads:[...new Set(diagnostics.recent.filter(sample =>
                                sample.startTime <= entry.startTime+entry.duration &&
                                sample.startTime+sample.milliseconds >= entry.startTime).map(sample => sample.operation))].slice(0,10)});
                });
                longTaskObserver.observe({entryTypes:['longtask']});
            } catch { diagnostics.capture.longTaskSupport = false; longTaskObserver = null; }
        }
        let expected = now()+1000;
        const pulse = () => {
            const current = now();
            if (!capture.ignoreNextPulse && document.visibilityState !== 'hidden' && current-expected > 100) boundedPush(capture.eventLoopDelays,
                {at:new Date().toISOString(),milliseconds:Math.round(current-expected)});
            capture.ignoreNextPulse = false;
            expected = current+1000; capturePulse = setTimeout(pulse,1000);
        };
        capturePulse = setTimeout(pulse,1000);
        captureTimer = setTimeout(stopPerformanceCapture,60000);
        say('Recording performance for 60 seconds. Reproduce the freeze, then copy Performance report.');
    }

    // A cache lives only for one synchronous read/plan. Never retain DOM
    // snapshots across an action, await, scroll, or observer callback.
    function withDOMReads(read,operation = read.name || 'DOM planning') {
        if (domReads) return read();
        const started = now();
        domReads = { roots:new WeakMap(), queries:new WeakMap(), labels:new WeakMap(), indexes:new WeakMap(),
            rendered:new WeakMap(),visible:new WeakMap(),scopes:new WeakMap(),locations:new WeakMap(),runtime:new WeakMap(),
            deadline:automatic && running && !['debugReportNow','updatePairHighlightsNow','Connection spotlight'].includes(operation) ? started+READ_BUDGET_MS : Infinity,
            counts:{queries:0,nodesWalked:0,rootsWalked:0,scopeLookups:0,styleChecks:0,textClones:0} };
        try { return read(); } finally {
            const sample = {operation,startTime:Number(started.toFixed(2)),milliseconds:Number((now()-started).toFixed(2)),...domReads.counts};
            readStats.passes++; readStats.last = sample;
            if (!readStats.slowest || sample.milliseconds > readStats.slowest.milliseconds) readStats.slowest = sample;
            boundedPush(diagnostics.recent,sample);
            if (sample.milliseconds >= 50) boundedPush(diagnostics.slowReads,{...sample,at:new Date().toISOString()});
            domReads = null;
            if (sample.milliseconds >= READ_BUDGET_MS && operation !== 'debugReportNow') performancePause(sample);
        }
    }

    function queryAll(root,selector) {
        checkReadBudget();
        if (!domReads) return [...root.querySelectorAll(selector)];
        let queries = domReads.queries.get(root);
        if (!queries) domReads.queries.set(root,queries = new Map());
        if (!queries.has(selector)) {
            const queryStarted = diagnostics.capture && !diagnostics.capture.endedAt ? now() : null;
            const nodes = [...root.querySelectorAll(selector)];
            if (queryStarted !== null && now()-queryStarted >= 5) boundedPush(diagnostics.capture.slowQueries,
                {selector:selector.slice(0,160),root:root.host?.tagName || root.nodeName || 'root',
                    milliseconds:Number((now()-queryStarted).toFixed(2)),results:nodes.length});
            queries.set(selector,nodes); domReads.counts.queries++;
            if (selector === '*') domReads.counts.nodesWalked += nodes.length;
            checkReadBudget();
        }
        return queries.get(selector);
    }

    function scopeIndex(root) {
        if (!domReads) return null;
        if (domReads.indexes.has(root)) return domReads.indexes.get(root);
        const ids = new Map(), labels = [], guides = new Map();
        for (const node of queryAll(root,'*')) {
            const guide = node.getAttribute?.('data-na-component');
            if (guide && !guides.has(guide)) guides.set(guide,node);
            if (node.closest?.('[data-na-answers]')) continue;
            for (const key of [node.getAttribute?.('data-adapt-id'),node.getAttribute?.('data-component-id'),
                node.id,...(node.getAttribute?.('class') || '').split(/\s+/)]) {
                if (key && !ids.has(key)) ids.set(key,node);
            }
            if (node.tagName === 'LABEL' && node.id?.endsWith('-label')) labels.push(node);
        }
        // An empty real DOM root is still a valid negative index. Falling
        // back to three selectors for every schema in every empty shadow
        // root can generate hundreds of thousands of redundant searches.
        const index = ids.size || typeof root.nodeType === 'number' ? {ids,labels,guides} : null;
        domReads.indexes.set(root,index);
        return index;
    }

    function candidateRoots(id,roots) {
        if (!domReads || roots.length === 1) return roots;
        let locations = domReads.locations.get(roots);
        if (!locations) {
            const ids = new Map(),fallback = [];
            roots.forEach((root,position) => {
                const index = scopeIndex(root);
                if (!index) { fallback.push(position); return; }
                const add = key => {
                    if (!ids.has(key)) ids.set(key,new Set());
                    ids.get(key).add(position);
                };
                for (const key of index.ids.keys()) add(key);
                for (const key of index.guides.keys()) add(key);
                for (const label of index.labels) {
                    for (let dash=label.id.indexOf('-'); dash>=0; dash=label.id.indexOf('-',dash+1)) add(label.id.slice(0,dash));
                }
            });
            domReads.locations.set(roots,locations = {ids,fallback});
        }
        return [...new Set([...(locations.ids.get(id) || []),...locations.fallback])]
            .sort((a,b) => a-b).map(position => roots[position]);
    }

    function runtimeQuestions(roots) {
        if (domReads?.runtime.has(roots)) return domReads.runtime.get(roots);
        const nodes = roots.flatMap(root => queryAll(root,'fieldset,.question,.mcq,[data-question-id]'));
        if (domReads) domReads.runtime.set(roots,nodes);
        return nodes;
    }

    function readPreferences() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {
                hints: localStorage.getItem('ansEnabled') === 'true',
                color: localStorage.getItem('ansColor') || defaults.color
            };
            return {
                hints: typeof saved.hints === 'boolean' ? saved.hints : defaults.hints,
                color: /^#[\da-f]{6}$/i.test(saved.color) ? saved.color : defaults.color,
                theme: ['system', 'course', 'light', 'dark'].includes(saved.theme) ? saved.theme : defaults.theme,
                paced: typeof saved.paced === 'boolean' ? saved.paced : defaults.paced,
                submit: typeof saved.submit === 'boolean' ? saved.submit : defaults.submit,
                navigate: typeof saved.navigate === 'boolean' ? saved.navigate : defaults.navigate,
                labs: typeof saved.labs === 'boolean' ? saved.labs : defaults.labs,
                connectionFocus: typeof saved.connectionFocus === 'boolean' ? saved.connectionFocus : defaults.connectionFocus,
                position: saved.position && Number.isFinite(saved.position.x) && Number.isFinite(saved.position.y)
                    ? { x:saved.position.x, y:saved.position.y } : null
            };
        } catch { return { ...defaults }; }
    }

    function savePreferences() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); }
        catch { say('Settings work for this session; browser storage is unavailable.'); }
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    function plain(value) {
        value = String(value ?? '');
        if (plainCache.has(value)) return plainCache.get(value);
        const template = document.createElement('template');
        template.innerHTML = value;
        const text = (template.content.textContent || '').replace(/\s+/g, ' ').trim();
        if (plainCache.size >= 512) plainCache.delete(plainCache.keys().next().value);
        plainCache.set(value,text);
        return text;
    }

    function itemsOf(component) {
        return Array.isArray(component._items) ? component._items.filter(item => item && typeof item === 'object') : [];
    }

    function scoringOptions(text) {
        const fullCredit = text.match(/^(?:[1-9]\d*(?:\.\d+)?)\s+points?\s+for\s+(.+?)\s*0\s+points?\s+for\s+any\s+other\s+option\.?$/i);
        const partialCredit = text.match(/^(.+?)\s+are\s+correct\.\s*(?:[1-9]\d*(?:\.\d+)?)\s+points?\s+for\s+each\s+correct\s+option\.\s*0\s+points?\s+if\s+more\s+options\s+are\s+selected\s+than\s+required\.?$/i);
        const list = (fullCredit || partialCredit)?.[1].trim();
        if (!list || !/^Option\s+[1-9]\d*(?:(?:,\s*(?:and\s+)?|\s+and\s+)Option\s+[1-9]\d*)*$/i.test(list)) return null;
        return [...list.matchAll(/Option\s+([1-9]\d*)/gi)].map(match => Number(match[1]));
    }

    function choiceItems(component) {
        const items = itemsOf(component);
        if (items.some(item => typeof item._shouldBeSelected === 'boolean')) return items;
        // Secure responses can omit the usual flags. Require every supported
        // scoring interpretation to agree on the full 1-based option set.
        const interpretations = component._smvWiseScoring?.outcomes?.interpretvar;
        if (component._component !== 'mcq' || !Number.isSafeInteger(component._selectable) ||
            component._selectable < 1 || component._selectable > items.length ||
            items.length < 2 || items.length !== component._items.length ||
            !Array.isArray(interpretations) || !interpretations.length) return items;
        let selected = null;
        for (const interpretation of interpretations) {
            const text = typeof interpretation?.interpret === 'string' ? interpretation.interpret.trim() : '';
            const options = scoringOptions(text);
            if (!options || options.length !== component._selectable || new Set(options).size !== options.length ||
                options.some(option => !Number.isSafeInteger(option) || option > items.length)) return items;
            options.sort((a,b) => a-b);
            if (selected && selected.some((option,index) => option !== options[index])) return items;
            selected = options;
        }
        // Derive a local view; never add flags to the server's scoring schema.
        return items.map((item,index) => ({...item,_shouldBeSelected:selected.includes(index+1)}));
    }

    function answerPairs(component) {
        const items = itemsOf(component);
        switch (component._component) {
            case 'objectMatching':
                return items.filter(item => typeof item.question === 'string' && typeof item.answer === 'string')
                    .map(item => [item.question, item.answer]);
            case 'matching':
            case 'matchingGraphic':
            case 'fillBlanks':
                return items.flatMap(item => (Array.isArray(item._options) ? item._options : [])
                    .filter(option => option && option._isCorrect === true)
                    .map(option => [item.text || item._graphic?.alt || 'Image '+(items.indexOf(item)+1), option.text || '']));
            case 'stacker':
                return items.filter(item => Array.isArray(item.position) && item.position.length && item._options)
                    .map(item => [item._options.text || '', 'Position ' + item.position.join(', ')]);
            case 'slider':
                return component._correctAnswer === undefined ? [] : [['Slider', String(component._correctAnswer)]];
            case 'yesNo':
                return items.filter(item => typeof item._shouldBeSelected === 'boolean')
                    .map(item => [item._graphic?.alt || item._graphic?.src?.split('/').pop() || item.text || 'Image',
                        item._shouldBeSelected ? 'Yes' : 'No']);
            default: return [];
        }
    }

    function decorate(component) {
        if (!component || typeof component !== 'object') return false;
        if (component._component === 'mcq' || component._component === 'gmcq') {
            let changed = false;
            const requirements = choiceItems(component);
            for (const [index,item] of itemsOf(component).entries()) {
                if (requirements[index]?._shouldBeSelected !== true || typeof item.text !== 'string' || item.text.includes('data-na-correct')) continue;
                item.text = '<span data-na-correct style="color:var(--color-cheat, currentColor);">' + item.text + '</span>';
                changed = true;
            }
            return changed;
        }
        const pairs = answerPairs(component);
        if (!pairs.length || (component.body || '').includes('data-na-answers')) return false;
        const rows = pairs.map(([question, answer], index) => '<div class="na-pair" data-na-pair-index="' + index + '"><span>' + escapeHTML(plain(question)) +
            '</span><span aria-hidden="true" class="na-arrow">→</span><strong>' + escapeHTML(plain(answer)) + '</strong></div>').join('');
        component.body = (component.body || '') +
            '<details data-na-answers data-na-component="' + escapeHTML(component._id || component.id || '') +
            '" open style="display:var(--display-cheat, none);"><summary>Answer guide · ' + pairs.length +
            (pairs.length === 1 ? ' pair' : ' pairs') + '</summary><div class="na-pairs">' + rows + '</div></details>';
        return true;
    }

    function assessmentResponsePath(pathname) {
        return /\/(?:[\w-]*-)?(?:assessments?|questions?)(?:[/-]|$)/i.test(pathname);
    }

    function secureQuestionResponse(url) {
        return url.protocol === 'https:' && url.hostname === 'ssac-backend.netacad.com' &&
            /^\/v3\//.test(url.pathname);
    }

    // The two transport adapters keep their own acceptance and response rules.
    // Capture owns untouched retention, request context, accounting and refresh.
    const questionCapture = (() => {
        const counts = {fetch:0,xhr:0,questionRecords:0};
        const contexts = new Map();

        function componentRecords(data) {
            const found = [], queue = [data];
            for (let index = 0; index < queue.length && index < 20000; index++) {
                const value = queue[index];
                if (!value || typeof value !== 'object') continue;
                if (!Array.isArray(value) && typeof value._component === 'string') {
                    found.push(value);
                } else queue.push(...Object.values(value).filter(child => child && typeof child === 'object'));
            }
            return found;
        }

        function secureQuestionEnvelope(data) {
            const component = data?.component;
            return !!component && isQuestion(component) && typeof (component._id || component.id) === 'string' &&
                typeof component.body === 'string' && Array.isArray(component._items) &&
                Number.isSafeInteger(data.index) && data.index >= 0;
        }

        function rememberSecureQuestion(data,url,route) {
            if (!secureQuestionResponse(url)) return;
            for (const envelope of [data,data?.nextQuestion]) {
                if (!secureQuestionEnvelope(envelope)) continue;
                const id = String(envelope.component._id || envelope.component.id);
                contexts.set(id,{index:envelope.index,route});
            }
        }

        function receive(data,{transport,url,route},decorateRecord,respond) {
            counts[transport]++;
            return withDOMReads(() => {
                rememberSecureQuestion(data,url,route);
                const records = componentRecords(data);
                let changed = false;
                for (const component of records) {
                    checkReadBudget();
                    const id = component._id || component.id;
                    // Retain each record before decoration; failures deliberately
                    // leave earlier records and counters in place without refresh.
                    if (id) components.set(String(id),JSON.parse(JSON.stringify(component)));
                    if (id && isQuestion(component)) counts.questionRecords++;
                    changed = decorateRecord?.(component) || changed;
                }
                if (records.length) scheduleRefresh();
                // Response reconstruction stays inside the measured read, after refresh.
                return respond?.(changed);
            },transport === 'fetch' ? 'Process course response' : 'Observe course XHR response');
        }

        function matchesPage(id) {
            const context = contexts.get(String(id));
            if (!context) return true;
            if (context.route !== location.href || all(document,'button.review-screen-button.active-block').some(rendered)) return false;
            const active = activeAssessmentIndex();
            return active === null || active === context.index;
        }

        return {receive,matchesPage,report:() => ({...counts})};
    })();

    function activeAssessmentIndex() {
        const active = assessmentQuestionButtons().filter(button =>
            /(?:^|\s)active-block(?:\s|$)/.test(button.className || '') ||
            /^selected\s+Question\s+\d+$/i.test(button.getAttribute('aria-label') || ''));
        if (active.length !== 1) return null;
        const number = (active[0].getAttribute('aria-label') || labelText(active[0])).match(/(?:Question\s+|^Q)([1-9]\d*)$/i);
        return number ? Number(number[1])-1 : null;
    }

    // Some assessment players use XMLHttpRequest instead of fetch. Observe
    // their existing JSON responses without replacing or mutating the body.
    const xhrPrototype = window.XMLHttpRequest?.prototype;
    if (xhrPrototype?.open && xhrPrototype?.send) {
        const originalOpen = xhrPrototype.open, originalSend = xhrPrototype.send;
        const requests = new WeakMap(), observed = new WeakSet();
        xhrPrototype.open = function (method,url,...rest) {
            requests.delete(this);
            try {
                const parsed = new URL(String(url),location.href);
                if (secureQuestionResponse(parsed) || (parsed.origin === new URL(location.href).origin &&
                    (parsed.pathname.endsWith('/components.json') || assessmentResponsePath(parsed.pathname)))) requests.set(this,{url:parsed,route:location.href});
            } catch { /* Keep native URL validation unchanged. */ }
            return originalOpen.call(this,method,url,...rest);
        };
        xhrPrototype.send = function (...args) {
            if (!observed.has(this)) {
                observed.add(this);
                this.addEventListener('load',() => {
                    try {
                        if (!requests.has(this) || this.status < 200 || this.status >= 300 ||
                            !/json/i.test(this.getResponseHeader('content-type') || '')) return;
                        if (this.responseType && !['text','json'].includes(this.responseType)) return;
                        const data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
                        const {url,route} = requests.get(this);
                        questionCapture.receive(data,{transport:'xhr',url,route});
                    } catch (error) { console.warn('[Course Helper] Could not inspect course XHR:',error); }
                });
            }
            return originalSend.apply(this,args);
        };
    }

    // Only intercept existing course requests. No update checks, remote assets,
    // independent fetches, injected event handlers, or image-load hooks.
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const requestRoute = location.href;
        const response = await originalFetch.apply(this, args);
        try {
            const input = args[0];
            // Prefer the native response URL; Request/URL objects can originate
            // in a different realm and fail instanceof checks in userscripts.
            const url = response.url || (typeof input === 'string' ? input : input?.url || input?.href);
            if (!response.ok || !url) return response;
            const parsed = new URL(url, location.href), pathname = parsed.pathname;
            const componentFile = pathname.endsWith('/components.json');
            const questionResponse = (assessmentResponsePath(pathname) || secureQuestionResponse(parsed)) &&
                /json/i.test(response.headers.get('content-type') || '');
            if (!componentFile && !questionResponse) return response;
            const data = await response.clone().json();
            return questionCapture.receive(data,{transport:'fetch',url:parsed,route:requestRoute},decorate,changed => {
                if (!changed) return response;
                const headers = new Headers(response.headers);
                for (const name of ['content-length', 'content-encoding', 'etag', 'content-md5', 'digest']) headers.delete(name);
                return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers });
            });
        } catch (error) {
            console.warn('[Course Helper] Kept the original course response:', error);
            return response;
        }
    };

    const hintCSS = [
        '[data-na-correct], [data-na-correct] * { color:var(--color-cheat, inherit) !important; transition:color .15s ease; }',
        '[data-na-answers] { margin:14px 0; padding:12px 14px; border:1px solid var(--color-picked-user,#4579f2);',
        'border-radius:10px; background:transparent; font:inherit; text-align:start; }',
        '[data-na-answers] summary { cursor:pointer; font-weight:600; font-size:.88em; color:inherit; }',
        '[data-na-answers] .na-pairs { display:grid; gap:0; margin-top:8px; }',
        '[data-na-answers] .na-pair { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(80px,.42fr);',
        'align-items:center; gap:12px; padding:9px 0; overflow-wrap:anywhere; font-size:.9em; }',
        '[data-na-answers] .na-pair + .na-pair { border-top:1px solid #8884; }',
        '[data-na-answers] strong { color:var(--color-picked-user,#4579f2); font-weight:650; }',
        '[data-na-answers] .na-arrow { opacity:.55; }',
        '[data-na-answers] .na-graphic-preview { width:88px; height:64px; object-fit:contain; vertical-align:middle; margin-inline-end:10px; }',
        '[data-na-pair-source] { outline:2px dashed var(--color-picked-user,#4579f2) !important; outline-offset:3px; }',
        '[data-na-pair-target] { outline:3px solid var(--color-picked-user,#4579f2) !important; outline-offset:3px;',
        'box-shadow:0 0 0 6px color-mix(in srgb,var(--color-picked-user,#4579f2) 18%,transparent) !important; }',
        '@media(max-width:480px) { [data-na-answers] .na-pair { grid-template-columns:minmax(0,1fr) auto; }',
        '[data-na-answers] .na-arrow { display:none; } }'
    ].join('\n');

    function rootsUnder(root = document) {
        if (domReads?.roots.has(root)) return domReads.roots.get(root);
        if (domReads) domReads.counts.rootsWalked++;
        const roots = [root];
        if (root.id !== HOST_ID && root.shadowRoot) roots.push(...rootsUnder(root.shadowRoot));
        for (const node of queryAll(root,'*')) {
            if (node.id !== HOST_ID && node.shadowRoot) roots.push(...rootsUnder(node.shadowRoot));
        }
        if (domReads) domReads.roots.set(root,roots);
        return roots;
    }

    function courseMutations(records) {
        // Player timers/captions and our own thumbnails do not add course
        // activities. Observing them used to schedule full scans during playback.
        return records.some(record => {
            const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
            return !target?.closest?.('[data-na-answers],.video-js,.vjs-signedTranscript-widget');
        });
    }

    function scheduleRefresh() {
        diagnostics.counters.refreshRequests++;
        if (refreshSuspended) return;
        if (observerTimer) return;
        observerTimer = setTimeout(() => {
            observerTimer = null;
            if (document.visibilityState !== 'hidden') refresh();
        }, 250);
    }

    function refresh() {
        diagnostics.counters.refreshes++;
        try { return withDOMReads(refreshNow); }
        catch (error) { if (error.name !== 'HelperScanBudgetExceeded') throw error; }
    }

    function refreshNow() {
        if (!document.body || !components.size) return;
        if (!panel) mountPanel();
        applyPreferences();
        for (const root of rootsUnder()) {
            if (watchedRoots.has(root)) continue;
            watchedRoots.add(root);
            const style = document.createElement('style');
            style.textContent = hintCSS;
            (root === document ? document.head || document.documentElement : root).appendChild(style);
            new MutationObserver(records => {
                diagnostics.counters.mutationCallbacks++; diagnostics.counters.mutationRecords += records.length;
                if (courseMutations(records)) scheduleRefresh(); else diagnostics.counters.ignoredMutationBatches++;
            })
                .observe(root, { childList:true, subtree:true });
            root.addEventListener('click', handleConnectionSelection);
            root.addEventListener('focusin', handleConnectionSelection);
        }
        updatePairHighlights();
        refreshGraphicGuides();
        if (resumePending()) startAuto();
    }

    function applyPreferences() {
        const html = document.documentElement;
        for (const [name,value] of [['--color-picked-user',preferences.color],
            ['--color-cheat',preferences.hints ? preferences.color : 'inherit'],
            ['--display-cheat',preferences.hints ? 'block' : 'none']]) {
            if (html.style.getPropertyValue?.(name) !== value) html.style.setProperty(name,value);
        }
        if (panel && panel.host.dataset.theme !== effectiveTheme()) panel.host.dataset.theme = effectiveTheme();
        if (!preferences.hints || !preferences.connectionFocus) clearPairHighlights();
    }

    function effectiveTheme() {
        if (preferences.theme === 'light' || preferences.theme === 'dark') return preferences.theme;
        if (preferences.theme === 'course') {
            for (const element of [document.body, document.documentElement]) {
                const theme = element?.getAttribute('data-theme');
                if (theme === 'dark' || theme === 'light') return theme;
            }
        }
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function say(message) { if (status && status.textContent !== message) status.textContent = message; }

    function mountPanel() {
        if (document.getElementById(HOST_ID)) return;
        const host = document.createElement('div');
        host.id = HOST_ID;
        document.body.appendChild(host);
        panel = host.attachShadow({ mode:'open' });
        panel.innerHTML = [
            '<style>',
            ':host { all:initial; position:fixed; inset:auto 16px 16px auto; z-index:2147483646;',
            'font:14px/1.45 system-ui,sans-serif; color-scheme:light; --bg:#fff; --fg:#20242c; --muted:#596272;',
            '--line:#dfe3ea; --soft:#f4f6f9; --accent:#245cc5; color:var(--fg); }',
            ':host([data-theme=dark]) { color-scheme:dark; --bg:#20242c; --fg:#f2f4f8; --muted:#bac2d0; --line:#454d5b; --soft:#2c323c; --accent:#91b9ff; }',
            '@media(prefers-color-scheme:dark) { :host([data-theme=system]) { color-scheme:dark; --bg:#20242c; --fg:#f2f4f8; --muted:#bac2d0; --line:#454d5b; --soft:#2c323c; --accent:#91b9ff; } }',
            '* { box-sizing:border-box; } button,input,select { font:inherit; } button,summary,input,select { accent-color:var(--accent); }',
            'button { cursor:pointer; background:var(--soft); color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:9px 12px; }',
            'button:hover { filter:brightness(.95); } button:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }',
            'button:disabled { opacity:.5; cursor:default; } h2,p { margin:0; } h2 { font-size:15px; font-weight:650; }',
            '.panel { width:min(330px,calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto; background:var(--bg); border:1px solid var(--line);',
            'border-radius:14px; box-shadow:0 8px 32px #0002; }',
            'header { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--line); }',
            '#drag-handle { flex:1; cursor:grab; touch-action:none; user-select:none; } #drag-handle:active { cursor:grabbing; }',
            '#drag-handle:focus-visible { outline:3px solid var(--accent); outline-offset:4px; border-radius:4px; }',
            'header small { color:var(--muted); font-size:11px; } .close { border:0; background:transparent; font-size:20px; padding:0 5px; }',
            '.content { padding:4px 16px 16px; } .row { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:13px 0; }',
            '.row + .row { border-top:1px solid var(--line); } .row span { display:block; } .sub { font-size:12px; color:var(--muted); margin-top:2px; }',
            'input[type=checkbox] { width:18px; height:18px; flex:none; cursor:pointer; } input[type=color] { width:38px; height:28px; padding:2px; border:1px solid var(--line); border-radius:6px; background:var(--bg); }',
            '.actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:4px 0 12px; }',
            '.primary { color:var(--bg); background:var(--accent); border-color:var(--accent); font-weight:600; }',
            '.stop { color:#b32636; border-color:#b32636; background:var(--bg); }',
            '#status { background:var(--soft); border-radius:8px; padding:10px 12px; color:var(--muted); font-size:12px; min-height:52px; }',
            'details { margin-top:12px; } summary { cursor:pointer; color:var(--muted); font-size:12px; }',
            'select { max-width:130px; padding:5px; background:var(--soft); color:var(--fg); border:1px solid var(--line); border-radius:6px; }',
            '#launcher { box-shadow:0 3px 16px #0002; border-radius:24px; background:var(--bg); font-weight:600; } [hidden] { display:none !important; }',
            '</style>',
            '<section class="panel" aria-label="Course Helper">',
            '<header><div id="drag-handle" tabindex="0" role="group" aria-label="Move panel: drag or use arrow keys; Home resets position"><h2>Course Helper</h2><small>Local · v3.0.5 · drag to move</small></div><button class="close" id="close" aria-label="Minimize panel">−</button></header>',
            '<div class="content">',
            '<label class="row"><span>Show answers<span class="sub">Highlights and connection guides</span></span><input id="hints" type="checkbox"></label>',
            '<div class="actions"><button id="fill">Fill visible</button><button id="auto" class="primary">Start auto</button></div>',
            '<p id="status" role="status" aria-live="polite">Ready. Open an activity to begin.</p>',
            '<details><summary>Options</summary>',
            '<label class="row"><span>Paced interactions<span class="sub">Variable pauses between actions</span></span><input id="paced" type="checkbox"></label>',
            '<label class="row"><span>Submit answers<span class="sub">Submit supported filled questions</span></span><input id="submit" type="checkbox"></label>',
            '<label class="row"><span>Continue through course<span class="sub">Scroll and follow Next after completion</span></span><input id="navigate" type="checkbox"></label>',
            '<label class="row"><span>Lab downloads<span class="sub">Interact with labs; suppress file tabs</span></span><input id="labs" type="checkbox"></label>',
            '<label class="row"><span>Connection spotlight<span class="sub">Select a source to highlight its destination</span></span><input id="connectionFocus" type="checkbox"></label>',
            '<label class="row"><span>Answer color</span><input id="color" type="color"></label>',
            '<label class="row"><span>Panel theme</span><select id="theme"><option value="system">System</option><option value="course">Course</option><option value="light">Light</option><option value="dark">Dark</option></select></label>',
            '<p class="sub">Auto uses the course controls and waits for completion before moving on. Videos play the final second. Stop anytime or press Escape.</p>',
            '<button id="capture" type="button">Record performance (60s)</button> <button id="performance" type="button">Performance report</button>',
            '<button id="debug" type="button">Debug report</button><textarea id="debug-output" aria-label="Debug report" readonly hidden style="width:100%;min-height:160px;margin-top:8px;font:12px monospace;"></textarea>',
            '</details></div></section>',
            '<button id="launcher" hidden aria-label="Open Course Helper" aria-expanded="false">Course Helper</button>'
        ].join('\n');
        status = panel.querySelector('#status');
        for (const key of ['hints','paced','submit','navigate','labs','connectionFocus','color','theme']) {
            const input = panel.querySelector('#' + key);
            if (input.type === 'checkbox') input.checked = preferences[key];
            else input.value = preferences[key];
            input.addEventListener('change', () => {
                preferences[key] = input.type === 'checkbox' ? input.checked : input.value;
                savePreferences(); applyPreferences();
                updatePairHighlights();
                // Cancel a pending action before it runs with stale options.
                generation++;
            });
        }
        const setOpen = open => {
            panel.querySelector('.panel').hidden = !open;
            panel.querySelector('#launcher').hidden = open;
            panel.querySelector('#launcher').setAttribute('aria-expanded', String(open));
            panel.querySelector(open ? '#close' : '#launcher').focus();
            if (preferences.position) positionPanel(preferences.position.x,preferences.position.y);
        };
        panel.querySelector('#close').addEventListener('click', () => setOpen(false));
        panel.querySelector('#launcher').addEventListener('click', () => setOpen(true));
        panel.querySelector('#fill').addEventListener('click', () => running ? stop() : runBatch(false));
        panel.querySelector('#auto').addEventListener('click', () => automatic ? stop() : startAuto());
        panel.querySelector('#capture').addEventListener('click',startPerformanceCapture);
        panel.querySelector('#performance').addEventListener('click',() => {
            const output = panel.querySelector('#debug-output');
            output.value = JSON.stringify(performanceReport(),null,2); output.hidden = false;
            output.focus(); output.select();
            say('Performance report selected. Copy it to inspect or share.');
        });
        panel.querySelector('#debug').addEventListener('click',() => {
            const output = panel.querySelector('#debug-output');
            output.value = JSON.stringify(debugReport(),null,2); output.hidden = false;
            output.focus(); output.select();
            say('Debug report selected. Copy it to inspect or share.');
        });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && (running || automatic)) stop(); });
        installPanelDrag();
        window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change',applyPreferences);
        for (const element of [document.body,document.documentElement]) {
            if (element) new MutationObserver(applyPreferences).observe(element,{ attributes:true, attributeFilter:['data-theme'] });
        }
        say('Ready. Open an activity, then fill it or start auto.');
    }

    function clampPosition(x,y,width,height,viewportWidth = innerWidth,viewportHeight = innerHeight) {
        return { x:Math.max(8,Math.min(x,Math.max(8,viewportWidth-width-8))),
            y:Math.max(8,Math.min(y,Math.max(8,viewportHeight-height-8))) };
    }

    function positionPanel(x,y) {
        if (!panel) return;
        const rect = panel.host.getBoundingClientRect();
        const position = clampPosition(x,y,rect.width,rect.height);
        Object.assign(panel.host.style,{ left:position.x+'px', top:position.y+'px', right:'auto', bottom:'auto' });
        return position;
    }

    function installPanelDrag() {
        const handle = panel.querySelector('#drag-handle');
        let drag = null;
        handle.addEventListener('pointerdown',event => {
            if (event.button !== 0) return;
            const rect = panel.host.getBoundingClientRect();
            drag = { pointer:event.pointerId, dx:event.clientX-rect.left, dy:event.clientY-rect.top };
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener('pointermove',event => {
            if (!drag || drag.pointer !== event.pointerId) return;
            preferences.position = positionPanel(event.clientX-drag.dx,event.clientY-drag.dy);
        });
        const finish = () => { if (drag) savePreferences(); drag = null; };
        handle.addEventListener('pointerup',finish);
        handle.addEventListener('pointercancel',finish);
        handle.addEventListener('lostpointercapture',finish);
        handle.addEventListener('keydown',event => {
            const movement = { ArrowLeft:[-16,0], ArrowRight:[16,0], ArrowUp:[0,-16], ArrowDown:[0,16] }[event.key];
            if (event.key === 'Home') {
                event.preventDefault(); preferences.position = null;
                Object.assign(panel.host.style,{ left:'',top:'',right:'',bottom:'' }); savePreferences();
            } else if (movement) {
                event.preventDefault();
                const rect = panel.host.getBoundingClientRect();
                preferences.position = positionPanel(rect.left+movement[0],rect.top+movement[1]); savePreferences();
            }
        });
        if (preferences.position) positionPanel(preferences.position.x,preferences.position.y);
        window.addEventListener('resize',() => {
            if (preferences.position) preferences.position = positionPanel(preferences.position.x,preferences.position.y);
        });
    }

    function rendered(node) {
        if (node && domReads?.rendered.has(node)) return domReads.rendered.get(node);
        const value = renderedNow(node);
        if (node && domReads) domReads.rendered.set(node,value);
        return value;
    }

    function renderedNow(node) {
        if (!node?.isConnected || !node.getClientRects().length) return false;
        if (domReads) domReads.counts.styleChecks++;
        const view = node.ownerDocument?.defaultView;
        const style = view ? view.getComputedStyle(node) : getComputedStyle(node);
        return style.visibility !== 'hidden' && style.display !== 'none';
    }

    function visible(node) {
        if (node && domReads?.visible.has(node)) return domReads.visible.get(node);
        const value = visibleNow(node);
        if (node && domReads) domReads.visible.set(node,value);
        return value;
    }

    function visibleNow(node) {
        if (!rendered(node)) return false;
        const view = node.ownerDocument?.defaultView;
        const box = node.getBoundingClientRect();
        return box.bottom > 0 && box.top < (view?.innerHeight || innerHeight) &&
            box.right > 0 && box.left < (view?.innerWidth || innerWidth);
    }

    function available(node) {
        return document.visibilityState !== 'hidden' && visible(node) && !node.disabled &&
            node.getAttribute('aria-disabled') !== 'true' && !node.classList.contains('is-disabled') &&
            !node.classList.contains('disabled') && !node.closest('[inert]');
    }

    function enabledRendered(node) {
        return document.visibilityState !== 'hidden' && rendered(node) && !node.disabled &&
            node.getAttribute('aria-disabled') !== 'true' && !node.classList.contains('is-disabled') &&
            !node.classList.contains('disabled') && !node.closest('[inert]');
    }

    function all(scope, selector) {
        return rootsUnder(scope).flatMap(root => queryAll(root,selector));
    }

    function scopeFor(component, roots, viewportOnly = true) {
        checkReadBudget();
        if (domReads) domReads.counts.scopeLookups++;
        if (!domReads) return scopeForNow(component,roots,viewportOnly);
        let byRoots = domReads.scopes.get(component);
        if (!byRoots) domReads.scopes.set(component,byRoots = new WeakMap());
        let modes = byRoots.get(roots);
        if (!modes) byRoots.set(roots,modes = new Map());
        if (!modes.has(viewportOnly)) modes.set(viewportOnly,scopeForNow(component,roots,viewportOnly));
        return modes.get(viewportOnly);
    }

    function scopeForNow(component, roots, viewportOnly) {
        const id = String(component._id || component.id || '');
        if (!id) return null;
        const escaped = CSS.escape(id);
        for (const root of candidateRoots(id,roots)) {
            const index = scopeIndex(root);
            const node = index ? index.ids.get(id) : root.querySelector('[data-adapt-id="' + escaped + '"], [data-component-id="' + escaped +
                '"], [id="' + escaped + '"], .' + escaped);
            if (node && !node.closest('[data-na-answers]') && (viewportOnly ? visible(node) : node.isConnected)) return widgetScope(node,component);
            const label = index ? index.labels.find(label => label.id.startsWith(id+'-')) : root.querySelector('label[id^="' + escaped + '-"][id$="-label"]');
            if (label) {
                const scope = label.closest('.component,[data-component-id],fieldset,.question,.mcq__widget,.gmcq__widget') || root.host;
                if (scope && (viewportOnly ? visible(scope) : scope.isConnected)) return widgetScope(scope,component);
            }
            const guide = index ? index.guides.get(id) : root.querySelector('[data-na-component="' + escaped + '"]');
            if (guide) {
                const scope = widgetScope(guide,component);
                if (scope && scope !== guide && (viewportOnly ? visible(scope) : scope.isConnected)) return scope;
            }
        }
        // Assessment widgets sometimes replace the component ID with a runtime ID.
        // Match the entire question and its options, never a lone answer string.
        if (!['mcq','gmcq'].includes(component._component)) return null;
        const question = plain(component.body);
        if (!question) return null;
        const candidates = runtimeQuestions(roots)
            .filter(node => (viewportOnly ? visible(node) : rendered(node)) && labelText(node).includes(question) &&
                itemsOf(component).every(item => exactControl(node,item.text,!viewportOnly)));
        return candidates.length === 1 ? candidates[0] : null;
    }

    function labelText(node) {
        checkReadBudget();
        if (domReads?.labels.has(node)) return domReads.labels.get(node);
        // Cloning custom course elements can run constructors and duplicate
        // question/guide trees. Read text without creating any DOM nodes.
        const content = node.querySelector?.('.mcq__item-text-inner,.gmcq__item-text-inner') || node;
        const excluded = '[data-na-answers],.na-inline-hint,.screenReader-position-text,.sr-only,.visually-hidden,[aria-hidden="true"]';
        const parts = [], stack = [content];
        while (stack.length) {
            checkReadBudget();
            const current = stack.pop();
            if (current.nodeType === 3) { parts.push(current.nodeValue || ''); continue; }
            if (current.matches?.(excluded)) continue;
            if (current.childNodes) {
                for (let i=current.childNodes.length-1; i>=0; i--) stack.push(current.childNodes[i]);
            } else parts.push(current.textContent || '');
        }
        const text = parts.join('').replace(/\s+/g, ' ').trim();
        if (domReads) domReads.labels.set(node,text);
        return text;
    }

    function composedParent(node) { return node?.parentElement || node?.parentNode?.host || node?.host || null; }

    function widgetScope(node,component) {
        if (!isQuestion(component) && !['packetTracer','adaptiveStartScreen'].includes(component._component)) return node;
        const id = String(component._id || component.id || '');
        let current = node, fallback = node;
        for (let depth = 0; current && current !== document && depth < 10; depth++,current = composedParent(current)) {
            if (current.matches?.('.component,[data-component-id]') &&
                (current.getAttribute('data-component-id') === id || current.classList.contains(id) || current.id === id)) return current;
            const labels = all(current,CONTROL_SELECTOR);
            const questionControls = labels.filter(control => !control.closest('[data-na-answers]') &&
                (control.matches('label,[role=radio],[role=checkbox]') || control.getAttribute('aria-haspopup') === 'listbox'));
            const selects = all(current,'select,[role=combobox]');
            if (questionControls.length || selects.length) {
                fallback = current;
                // Prefer the smallest widget with controls and its own Submit.
                if (submitControls(current).length === 1) return current;
                if (questionControls.length >= Math.max(1,itemsOf(component).length) || selects.length) return current;
            }
            if (current.matches?.('main,[role=main],.page,.assessment,.quiz')) break;
        }
        return fallback;
    }

    function exactControl(scope, text, offscreen = false) {
        const expected = plain(text);
        if (!expected) return null;
        const candidates = all(scope, CONTROL_SELECTOR);
        const matches = candidates.filter(node => (offscreen ? enabledRendered(node) : available(node)) && !node.closest('[data-na-answers]') && labelText(node) === expected);
        if (matches.length === 1) return matches[0];
        if (matches.length > 1 && matches.every(node => scopeContains(matches[0],node) || scopeContains(node,matches[0]))) {
            return matches.find(node => node.matches('label')) || matches[matches.length-1];
        }
        return null;
    }

    function connectionEndpoint(scope,text,interactive = true,side = null) {
        const expected = plain(text);
        if (!expected) return null;
        if (side) {
            const selector = side === 'source' ? '.objectMatching-category-item' : '.objectMatching-option-item';
            const controls = all(scope,selector).filter(control => enabledRendered(control) && !control.closest('[data-na-answers]'));
            if (controls.length) {
                // Resolve within the correct column, comparing the full label
                // with only an optional extra badge. A feature literally named
                // "A" must never resolve to another row's A badge.
                const matches = controls.filter(control => {
                    const label = labelText(control);
                    if (label === expected) return true;
                    const remainder = side === 'source' && label.startsWith(expected) ? label.slice(expected.length) :
                        side === 'target' && label.endsWith(expected) ? label.slice(0,-expected.length) : '';
                    return /^[A-Z]$/.test(remainder.trim());
                });
                return matches.length === 1 ? matches[0] : null;
            }
        }
        const direct = exactControl(scope,text);
        if (direct) return direct;
        const offscreen = all(scope,CONTROL_SELECTOR).filter(node => enabledRendered(node) &&
            !node.closest('[data-na-answers]') && labelText(node) === expected);
        if (offscreen.length === 1) return offscreen[0];
        const matches = all(scope,'*').filter(node => node.isConnected &&
            !node.closest('[data-na-answers]') && labelText(node) === expected &&
            ![...node.querySelectorAll('*')].some(child => labelText(child) === expected));
        if (matches.length !== 1) return null;
        const leaf = matches[0];
        const control = leaf.closest(CONTROL_SELECTOR + ',[draggable="true"]');
        return control && scopeContains(scope,control) ? control : interactive ? null : leaf.parentElement || leaf;
    }

    function scopeContains(scope,node) {
        for (let current = node; current; current = current.parentNode || current.host) if (current === scope) return true;
        return false;
    }

    function clearPairHighlights() {
        for (const node of highlighted) {
            node.removeAttribute('data-na-pair-source'); node.removeAttribute('data-na-pair-target');
        }
        highlighted.clear();
    }

    function updatePairHighlights() {
        return withDOMReads(updatePairHighlightsNow);
    }

    function updatePairHighlightsNow() {
        clearPairHighlights();
        if (!preferences.hints || !preferences.connectionFocus || !activePairs.size) return;
        const roots = rootsUnder();
        for (const [id,index] of activePairs) {
            const component = components.get(id);
            if (!component) continue;
            const pair = answerPairs(component)[index];
            const scope = scopeFor(component,roots,false);
            if (!scope || !pair) continue;
            const source = connectionEndpoint(scope,pair[0],false,'source');
            const target = connectionEndpoint(scope,pair[1],false,'target');
            if (!source || !target || source === target) continue;
            source.setAttribute('data-na-pair-source',''); target.setAttribute('data-na-pair-target','');
            highlighted.add(source); highlighted.add(target);
            for (const row of all(scope,'[data-na-pair-index="' + index + '"]')) {
                row.setAttribute('data-na-pair-source',''); highlighted.add(row);
            }
        }
    }

    const handledConnectionEvents = new WeakSet();
    function handleConnectionSelection(event) {
        if (refreshSuspended || handledConnectionEvents.has(event)) return;
        handledConnectionEvents.add(event);
        return withDOMReads(() => handleConnectionSelectionNow(event),'Connection spotlight');
    }

    function handleConnectionSelectionNow(event) {
        if (!preferences.hints || !preferences.connectionFocus) return;
        const path = event.composedPath();
        if (path.some(node => node.id === HOST_ID)) return;
        const roots = rootsUnder();
        for (const [id,component] of components) {
            if (component._component !== 'objectMatching') continue;
            const scope = scopeFor(component,roots);
            if (!scope || !path.some(node => scopeContains(scope,node))) continue;
            const pairs = answerPairs(component);
            const index = pairs.findIndex(([question]) => {
                const source = connectionEndpoint(scope,question,false,'source');
                return source && path.some(node => node === source || scopeContains(source,node));
            });
            if (index < 0) continue;
            activePairs.set(id,index); updatePairHighlights();
            say('Connect to: ' + plain(pairs[index][1]));
            return;
        }
    }

    function selectionAction(node, desired) {
        const input = node.matches('input') ? node : node.control || node.querySelector('input[type=radio],input[type=checkbox]') ||
            node.getRootNode?.().getElementById?.(node.getAttribute('for') || '');
        if (input) {
            if (input.disabled || input.checked === desired || (input.type === 'radio' && !desired)) return null;
            return { node, label:desired ? 'Select answer' : 'Clear answer', apply:() => {
                if (input.checked !== desired) input.click();
            } };
        }
        const aria = node.getAttribute('aria-checked') ?? node.getAttribute('aria-pressed');
        const checked = aria === 'true' || node.classList.contains('is-selected') || node.classList.contains('selected');
        if (aria !== null || node.classList.contains('is-selected') || node.classList.contains('selected')) {
            if (checked === desired) return null;
        } else if (!desired || opaqueSelections.get(node) === desired) return null;
        return { node, label:desired ? 'Select answer' : 'Clear answer', apply:() => {
            node.click(); opaqueSelections.set(node, desired);
        } };
    }

    function choiceControls(scope,expected,autoScroll) {
        // resolveChoices already decoded schema HTML. Decoding again would eat
        // literal angle-bracket text such as <password omitted>.
        if (!expected) return [];
        const usable = node => (autoScroll ? enabledRendered(node) : available(node)) && !node.closest('[data-na-answers]');
        const candidates = all(scope,CONTROL_SELECTOR).filter(node => usable(node) && labelText(node) === expected);
        for (const node of all(scope,'.mcq__item-text-inner,.gmcq__item-text-inner,[data-na-correct]')) {
            if (!rendered(node) || node.closest('[data-na-answers]') || labelText(node) !== expected) continue;
            for (let current = node; current && scopeContains(scope,current); current = composedParent(current)) {
                if (!current.matches('label,[role=radio],[role=checkbox],button')) continue;
                if (usable(current)) candidates.push(current);
                break;
            }
        }
        // Nested wrappers can describe the same input. Keep distinct sibling
        // options, including identical distractors, as distinct controls.
        const groups = [];
        for (const node of new Set(candidates)) {
            const group = groups.find(group => group.some(other => scopeContains(node,other) || scopeContains(other,node)));
            if (group) group.push(node); else groups.push([node]);
        }
        return groups.map(group => group.find(node => node.matches('label')) || group[group.length-1]);
    }

    function resolveChoices(component,scope,autoScroll) {
        const groups = new Map(), resolved = [];
        for (const item of choiceItems(component).filter(item => typeof item._shouldBeSelected === 'boolean')) {
            const text = plain(item.text);
            if (!groups.has(text)) groups.set(text,[]);
            groups.get(text).push(item);
        }
        if (!groups.size) return {resolved,reason:'Choice selection metadata is missing or unsupported (selectable: '+String(component._selectable ?? 'unspecified')+').'};
        for (const [text,items] of groups) {
            const desired = items[0]._shouldBeSelected;
            if (items.some(item => item._shouldBeSelected !== desired)) return {resolved,
                reason:'Identical answer text has conflicting selection requirements: '+text};
            const controls = choiceControls(scope,text,autoScroll);
            if (controls.length !== items.length) return {resolved,
                reason:'Resolved '+controls.length+' of '+items.length+' controls for answer: '+text};
            if (desired && controls.length > 1 && !controls.every(control =>
                control.matches('[role=checkbox]') || (control.control || control.querySelector('input'))?.type === 'checkbox')) {
                return {resolved,reason:'Multiple identical selected answers require identifiable checkbox controls: '+text};
            }
            for (const node of controls) resolved.push({item:items[0],node});
        }
        if (component._selectable > 1 && resolved.some(({node}) =>
            (node.control || node.querySelector('input'))?.type === 'radio')) {
            return {resolved,reason:'Multiple-selection metadata does not match the rendered radio controls.'};
        }
        return {resolved,reason:null};
    }

    function choiceActions(component, scope, autoScroll = false) {
        const {resolved,reason} = resolveChoices(component,scope,autoScroll);
        if (reason) return {actions:[],supported:false,reason};
        const actions = resolved.map(({ item, node }) => selectionAction(node, item._shouldBeSelected)).filter(Boolean);
        if (autoScroll) for (const action of actions) action.prepare = () => action.node.scrollIntoView?.({block:'center',behavior:'instant'});
        actions.sort((a,b) => Number(a.label !== 'Clear answer') - Number(b.label !== 'Clear answer'));
        return { actions, supported:true };
    }

    function choiceDiagnostics(component,scope) {
        const {resolved,reason} = resolveChoices(component,scope,true);
        return {reason,selectionMetadata:{selectable:component._selectable ?? null,
                interpretations:(Array.isArray(component._smvWiseScoring?.outcomes?.interpretvar) ? component._smvWiseScoring.outcomes.interpretvar : [])
                    .slice(0,30).map(entry => String(entry?.interpret || '').slice(0,1000))},
            expected:choiceItems(component).map(item => ({text:plain(item.text),selected:item._shouldBeSelected})),
            controls:resolved.map(({item,node}) => ({text:plain(item.text),selected:item._shouldBeSelected,
                id:node.id || null,for:node.getAttribute('for')}))};
    }

    function debugReport() {
        return withDOMReads(debugReportNow);
    }

    function debugReportNow() {
        const roots = rootsUnder();
        const describe = node => ({ tag:node.tagName,id:node.id || '',role:node.getAttribute('role'),
            classes:typeof node.className === 'string' ? node.className : '',
            label:node.getAttribute('aria-label'),text:labelText(node).slice(0,180),
            visible:visible(node),disabled:!!node.disabled,
            type:node.getAttribute('type'),for:node.getAttribute('for') });
        const activities = [];
        for (const component of components.values()) {
            const scope = scopeFor(component,roots);
            if (!scope) continue;
            const controls = all(scope,'label,input,select,button,[role=button],[role=combobox],[aria-haspopup=listbox]');
            const parents = [];
            for (let current = scope; current && current !== document && parents.length < 6; current = composedParent(current)) parents.push(describe(current));
            activities.push({ id:component._id || component.id,type:component._component,
                itemCount:itemsOf(component).length,completionMode:component._setCompletionOn || null,
                connections:component._component === 'objectMatching' ? connectionDiagnostics(component,scope) : undefined,
                choices:['mcq','gmcq'].includes(component._component) ? choiceDiagnostics(component,scope) : undefined,
                animation:component._component === 'adobe-animate' ? {
                    buttons:all(scope,'button,[role="button"]').map(node => ({label:node.getAttribute('aria-label'),title:node.getAttribute('title'),text:labelText(node)})),
                    timelines:all(scope,'input[type=range]').map(node => ({value:node.value,min:node.min,max:node.max})),
                    playback:animationPlayback.has(scope) ? (({started,clicks,lastClick,lastValue,lastProgress}) =>
                        ({started,clicks,lastClick,lastValue,lastProgress}))(animationPlayback.get(scope)) : null
                } : undefined,
                media:component._component === 'media' ? all(scope,'video,audio').map(player => ({
                    currentTime:player.currentTime,duration:Number.isFinite(player.duration) ? player.duration : null,
                    paused:player.paused,ended:player.ended,seeking:player.seeking,readyState:player.readyState,
                    networkState:player.networkState,errorCode:player.error?.code || null,
                    playback:mediaPlayback.has(player) ? {...mediaPlayback.get(player)} : null
                })) : undefined,
                tabContentVisits:component._component === 'tabs' ? [...(tabStates.get(scope)?.seen || [])] : undefined,
                graphicRows:component._component === 'matchingGraphic' ? itemsOf(component).map(item => ({
                    text:item.text || '',graphic:item._graphic || null,
                    options:(item._options || []).map(option => ({text:option.text,correct:option._isCorrect}))
                })) : undefined,
                images:component._component === 'matchingGraphic' ? all(scope,'img').map(img => ({
                    src:img.currentSrc || img.src || img.getAttribute('src'),alt:img.getAttribute('alt'),
                    bounds:{top:img.getBoundingClientRect().top,bottom:img.getBoundingClientRect().bottom,
                        left:img.getBoundingClientRect().left,right:img.getBoundingClientRect().right}
                })) : undefined,
                graphicLayout:component._component === 'matchingGraphic' ? {
                    assetMatchesPerItem:itemsOf(component).map(item => all(scope,'img')
                        .filter(img => !img.closest('[data-na-answers]') && imageMatchesItem(img,item)).length),
                    pairedControls:graphicBindings(component,scope,DROPDOWN_SELECTOR).length,
                    dropdowns:all(scope,DROPDOWN_SELECTOR).map(control => ({
                        text:labelText(control),bounds:{top:control.getBoundingClientRect().top,bottom:control.getBoundingClientRect().bottom,
                            left:control.getBoundingClientRect().left,right:control.getBoundingClientRect().right}
                    }))
                } : undefined,
                scope:describe(scope),parents,
                controls:controls.slice(0,40).map(describe),
                submit:submitControls(scope,true,true).map(describe) });
        }
        const navigation = courseNavigation.read();
        const next = navigation.next;
        const recovery = courseNavigation.recovery();
        return { version:'3.0.5',generatedAt:new Date().toISOString(),url:location.href,
            baseURI:document.baseURI || null,readPerformance:{...readStats},performanceDiagnostics:performanceReport(),activeActivity:activityStatus,pending:[...pendingQuestions],
            assessment:{questionButtons:assessmentQuestionButtons().slice(0,100).map(describe),
                activeIndex:activeAssessmentIndex(),
                capturedQuestionSchemas:[...components.values()].filter(isQuestion).length,responseCapture:questionCapture.report()},
            navigation:{automatic,enabled:preferences.navigate,status:status?.textContent || null,
                outlineRecovery:recovery ? {section:recovery.section,group:recovery.group,target:recovery.label,
                    reason:recovery.reason,attempted:recovery.attempted} : null,
                resolvedNext:next ? describe(next) : null,...navigationTrace},
            unfinishedActivities:unfinishedActivities(roots).map(({component,scope}) => ({
                id:component._id || component.id,type:component._component,title:plain(component.title),visible:visible(scope)
            })),pageComplete:navigation.pageComplete,activities,
            visibleControls:navigationDocuments().flatMap(doc => all(doc,'button,a[href],[role=button],material-icon[icon*=right]'))
                .filter(visible).slice(0,60).map(describe),
            navigationCandidates:navigationDocuments().flatMap(doc => all(doc,
                '[class*="next"],[class*="Next"],[aria-label*="Next"],[title*="Next"],[aria-current]'))
                .filter(visible).slice(0,40).map(describe) };
    }

    function questionRow(control,question,scope,selector) {
        for (let row = composedParent(control); row; row = composedParent(row)) {
            const count = all(row,selector).length;
            if (count > 1) break;
            if (question && (labelText(row).includes(question) || rootsUnder(row).some(root =>
                root !== row && (root.textContent || '').replace(/\s+/g,' ').includes(question)))) return row;
            if (row === scope) break;
        }
        return null;
    }

    function graphicSources(item) {
        const graphic = item._graphic || {};
        return [...new Set([graphic.src,graphic._src,graphic.large,graphic.small].filter(value => typeof value === 'string' && value))];
    }

    function assetPath(value) {
        // Compare asset identity rather than resolving against the course's
        // <base>, which can prepend en-US/ or a nested course folder twice.
        try { return new URL(value,new URL('/',location.href)).pathname; }
        catch { return ''; }
    }

    function imageMatchesItem(img,item) {
        const sources = graphicSources(item).map(assetPath).filter(Boolean);
        const path = assetPath(img.currentSrc || img.src || img.getAttribute('src') || '');
        return sources.length ? sources.some(source => path === source || path.endsWith(source.startsWith('/') ? source : '/'+source)) :
            !!plain(item._graphic?.alt) && plain(img.getAttribute('alt')) === plain(item._graphic.alt);
    }

    function graphicBindings(component,scope,selector) {
        const controls = all(scope,selector).filter(rendered);
        const images = all(scope,'img').filter(img => rendered(img) && !img.closest('[data-na-answers]'));
        const items = itemsOf(component);
        if (controls.length !== items.length) return [];
        const resolved = items.map(item => images.filter(img => imageMatchesItem(img,item)));
        if (resolved.some(matches => matches.length !== 1) || new Set(resolved.flat()).size !== items.length) return [];
        const imageNodes = resolved.map(matches => matches[0]);
        const costs = imageNodes.map(img => controls.map(control => {
            const a = img.getBoundingClientRect(), b = control.getBoundingClientRect();
            const widthA = a.right-a.left, widthB = b.right-b.left;
            const overlap = Math.min(a.right,b.right)-Math.max(a.left,b.left);
            const gap = b.top-a.bottom;
            if (widthA <= 0 || widthB <= 0 || a.bottom <= a.top || b.bottom <= b.top ||
                overlap < Math.min(widthA,widthB)*.6 || gap < -12 || gap > 240) return Infinity;
            return Math.max(0,gap)+Math.abs((a.left+a.right-b.left-b.right)/2);
        }));
        const uniqueBest = values => {
            const best = Math.min(...values);
            return Number.isFinite(best) && values.filter(value => value === best).length === 1 ? values.indexOf(best) : -1;
        };
        const indexes = costs.map(uniqueBest);
        if (indexes.some(index => index < 0) || new Set(indexes).size !== items.length ||
            indexes.some((index,i) => uniqueBest(costs.map(row => row[index])) !== i)) return [];
        return items.map((item,i) => ({ item,image:imageNodes[i],control:controls[indexes[i]] }));
    }

    function refreshGraphicGuides() {
        const roots = rootsUnder();
        for (const component of components.values()) {
            if (component._component !== 'matchingGraphic' || answerPairs(component).length !== itemsOf(component).length) continue;
            const scope = scopeFor(component,roots,false);
            if (!scope) continue;
            const images = all(scope,'img').filter(img => !img.closest('[data-na-answers]'));
            itemsOf(component).forEach((item,index) => {
                const matches = images.filter(img => imageMatchesItem(img,item));
                if (matches.length !== 1) return;
                for (const row of all(scope,'[data-na-pair-index="'+index+'"]')) {
                    if (row.querySelector('.na-graphic-preview')) continue;
                    const label = row.querySelector('span');
                    if (!label) continue;
                    const preview = document.createElement('img');
                    preview.className = 'na-graphic-preview'; preview.alt = plain(item._graphic?.alt) || 'Image '+(index+1);
                    preview.src = matches[0].currentSrc || matches[0].src;
                    label.prepend(preview);
                }
            });
        }
    }

    function matchingRow(control,item,component,scope,selector) {
        if (component._component !== 'matchingGraphic') return questionRow(control,plain(item.text),scope,selector);
        for (let row = composedParent(control); row; row = composedParent(row)) {
            if (all(row,selector).length > 1) break;
            const images = all(row,'img');
            if (images.some(img => !img.closest('[data-na-answers]') && imageMatchesItem(img,item))) return row;
            if (row === scope) break;
        }
        // Images and dropdowns may live in separate sibling/shadow containers.
        // Use a complete, mutual unique visual pairing; never array positions.
        const binding = graphicBindings(component,scope,selector).find(entry => entry.item === item && entry.control === control);
        if (binding) {
            let container = null;
            for (let row = composedParent(control); row; row = composedParent(row)) {
                if (all(row,selector).length !== 1) break;
                container = row;
                if (row === scope) break;
            }
            return container;
        }
        return null;
    }

    function selectActions(component, scope,autoScroll = false) {
        const items = itemsOf(component);
        const selects = all(scope,'select').filter(select => select.isConnected && !select.disabled);
        if (!selects.length) return customSelectActions(component,scope,autoScroll);
        if (!items.length || selects.length !== items.length) return { actions:[], supported:false,reason:'Dropdown count differs from question rows.' };
        const actions = [];
        let pending = false;
        for (const item of items) {
            const correct = (Array.isArray(item._options) ? item._options : []).filter(option => option?._isCorrect === true);
            if (correct.length !== 1) return { actions:[], supported:false };
            const matches = selects.filter(select => matchingRow(select,item,component,scope,'select') ||
                (component._component !== 'matchingGraphic' && selects.length === 1));
            if (matches.length !== 1) return { actions:[], supported:false };
            const select = matches[0];
            const options = [...select.options].filter(option => plain(option.textContent) === plain(correct[0].text) && !option.disabled);
            if (options.length !== 1) return { actions:[], supported:false };
            const option = options[0];
            const row = matchingRow(select,item,component,scope,'select');
            const proxy = rendered(select) ? select : row && all(row,'[role=combobox],.select2-selection,[aria-haspopup=listbox]').find(rendered);
            const target = proxy || (row && rendered(row) ? row : null);
            if (select.value === option.value) continue;
            if (!target || !rendered(target)) return { actions:[],supported:false,reason:'Dropdown has no rendered control.' };
            if (!available(target) && !autoScroll) { pending = true; continue; }
            actions.push({ node:target,prepare:autoScroll ? () => target.scrollIntoView?.({ block:'center',behavior:'instant' }) : null,
                label:'Choose match', apply:() => {
                select.value = option.value;
                select.dispatchEvent(new Event('input', { bubbles:true }));
                select.dispatchEvent(new Event('change', { bubbles:true }));
            } });
        }
        return { actions,supported:true,pending };
    }

    function customSelectActions(component,scope,autoScroll) {
        const combos = all(scope,DROPDOWN_SELECTOR).filter(enabledRendered);
        // Keep the accessible-control path for older widget versions.
        if (!combos.length) combos.push(...all(scope,'[role=combobox],[aria-haspopup=listbox]').filter(enabledRendered));
        if (!combos.length) return { actions:[],supported:false,reason:'No native select or accessible dropdown found.' };
        let pending = false;
        for (const item of itemsOf(component)) {
            const correct = (item._options || []).filter(option => option?._isCorrect === true);
            if (correct.length !== 1) return { actions:[],supported:false,reason:'Dropdown answer is ambiguous.' };
            const question = component._component === 'matchingGraphic' ? graphicSources(item).join('|') || plain(item._graphic?.alt) : plain(item.text);
            const answer = plain(correct[0].text);
            const matches = combos.filter(combo => matchingRow(combo,item,component,scope,DROPDOWN_SELECTOR) ||
                (component._component !== 'matchingGraphic' && combos.length === 1));
            if (matches.length !== 1) return { actions:[],supported:false,reason:component._component === 'matchingGraphic' ?
                'Cannot link this image to exactly one dropdown. Image rows may be loading or ambiguous.' :
                'Cannot associate a dropdown with its question.' };
            const combo = matches[0];
            if (labelText(combo) === answer) continue;
            if (!available(combo) && !autoScroll) { pending = true; continue; }
            const componentId = component._id || component.id;
            if (pendingDropdown?.combo === combo || (componentId && pendingDropdown?.componentId === componentId && pendingDropdown.question === question)) {
                const listId = combo.getAttribute('aria-controls') || combo.getAttribute('aria-owns');
                const lists = rootsUnder().flatMap(root => listId ? [...root.querySelectorAll('[id="'+CSS.escape(listId)+'"]')] :
                    [...root.querySelectorAll('[role=listbox]')]).filter(rendered);
                let options = lists.flatMap(list => all(list,'[role=option]')).filter(option => available(option) && labelText(option) === answer);
                if (!options.length && combo.matches('button.js-dropdown-btn')) {
                    const row = matchingRow(combo,item,component,scope,DROPDOWN_SELECTOR);
                    if (row) options = all(row,'[role=option],button,li,.dropdown__item,.dropdown__option')
                        .filter(option => option !== combo && available(option) && labelText(option) === answer);
                    options = options.filter(option => !options.some(other => other !== option && scopeContains(option,other)));
                }
                if (options.length === 1) return { supported:true,actions:[{ node:options[0],label:'Choose dropdown answer',apply:() => {
                    options[0].click(); pendingDropdown = null;
                } }] };
                if (combo.getAttribute('aria-expanded') === 'true') return { supported:false,actions:[],reason:'Open dropdown does not expose a unique answer option.' };
            }
            return { supported:true,actions:[{ node:combo,label:'Open dropdown',prepare:autoScroll ?
                () => combo.scrollIntoView?.({ block:'center',behavior:'instant' }) : null,apply:() => {
                    combo.click(); pendingDropdown = { combo,answer,question,componentId };
                } }] };
        }
        return { supported:true,actions:[],pending };
    }

    function connectionConfirmed(source,target,sourceText,targetText) {
        if (!source.matches('.objectMatching-category-item') || !target.matches('.objectMatching-option-item')) return null;
        // The answer itself may begin with a letter and space ("A section...").
        // A badge must be additional text outside the full schema label.
        const question = plain(sourceText), answer = plain(targetText);
        const sourceLabel = labelText(source), targetLabel = labelText(target);
        if (!question || !answer || !sourceLabel.startsWith(question) || !targetLabel.endsWith(answer)) return false;
        const letter = sourceLabel.slice(question.length).trim();
        return /^[A-Z]$/.test(letter) && targetLabel.slice(0,-answer.length).trim() === letter;
    }

    function resolveConnections(component,scope) {
        const pairs = answerPairs(component);
        const resolved = pairs.map(([question,answer]) => [connectionEndpoint(scope,question,true,'source'), connectionEndpoint(scope,answer,true,'target')]);
        const missing = resolved.findIndex(pair => pair.some(node => !node));
        const reason = !pairs.length ? 'No connection pairs were found in the question schema.' : missing >= 0 ?
            'Cannot uniquely resolve connection '+(missing+1)+' '+(!resolved[missing][0] ? 'source: '+plain(pairs[missing][0]) : 'answer: '+plain(pairs[missing][1])) :
            new Set(resolved.flat()).size !== resolved.length*2 ? 'More than one connection label resolves to the same control.' : null;
        return {pairs,resolved,reason};
    }

    function connectionDiagnostics(component,scope) {
        const {pairs,resolved,reason} = resolveConnections(component,scope);
        return {reason,pairs:pairs.map(([source,answer],index) => ({source:plain(source),answer:plain(answer),
            sourceResolved:!!resolved[index][0],answerResolved:!!resolved[index][1],
            confirmed:resolved[index].every(Boolean) ? connectionConfirmed(...resolved[index],source,answer) : null}))};
    }

    function connectionActions(component, scope, autoScroll = false) {
        const {pairs,resolved,reason} = resolveConnections(component,scope);
        if (reason) return {actions:[],supported:false,reason};
        const actions = [];
        let pending = false;
        for (const [index,[question,answer]] of resolved.entries()) {
            const confirmed = connectionConfirmed(question,answer,...pairs[index]);
            if (confirmed === true || (confirmed === null && visited.has(question) && visited.has(answer))) continue;
            if (!autoScroll && (!available(question) || !available(answer))) { pending = true; continue; }
            const prepare = node => autoScroll ? () => node.scrollIntoView?.({ block:'center',behavior:'instant' }) : null;
            actions.push({ node:question, prepare:prepare(question), label:'Select connection source', apply:() => { question.click(); } });
            actions.push({ node:answer, prepare:prepare(answer), label:'Connect pair', apply:() => {
                answer.click(); visited.add(question); visited.add(answer);
            } });
        }
        return { actions, supported:true, pending };
    }

    function sliderActions(component, scope) {
        const ranges = all(scope, 'input[type=range]').filter(available);
        const correct = Number(component._correctAnswer);
        if (ranges.length !== 1 || !Number.isFinite(correct)) return { actions:[], supported:false };
        const input = ranges[0];
        if (correct < Number(input.min || 0) || correct > Number(input.max || 100)) return { actions:[], supported:false };
        return { supported:true, actions:Number(input.value) === correct ? [] : [{
            node:input, label:'Set slider', apply:() => {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
                setter.call(input,String(correct));
                input.dispatchEvent(new Event('input',{ bubbles:true }));
                input.dispatchEvent(new Event('change',{ bubbles:true }));
            }
        }] };
    }

    function tabActions(scope,autoScroll) {
        const controls = all(scope,'[role=tab]').filter(enabledRendered);
        const keys = controls.map(node => node.getAttribute('aria-controls') || node.id || labelText(node));
        if (!controls.length || keys.some(key => !key) || new Set(keys).size !== keys.length) return {
            supported:false,actions:[],reason:'Tab controls could not be identified uniquely.' };
        let state = tabStates.get(scope);
        if (!state) { state = { seen:new Set(),opened:null }; tabStates.set(scope,state); }
        if (state.opened && keys.includes(state.opened)) {
            const key = state.opened;
            return { supported:true,actions:[{ node:scope,label:'View tab content',apply:() => {
                // Some courses only complete a tab once its content reaches
                // the viewport. Tall images need the bottom brought into view.
                scope.scrollIntoView?.({ block:'end',behavior:'instant' });
                state.seen.add(key); state.opened = null;
            } }] };
        }
        const index = keys.findIndex(key => !state.seen.has(key));
        if (index < 0) return { supported:true,actions:[],waiting:true,
            reason:'All tab contents were visited. Waiting for the course to mark this activity complete.' };
        const button = controls[index];
        if (!autoScroll && !available(button)) return { supported:true,actions:[],pending:true };
        return { supported:true,actions:[{ node:button,label:'Open lesson tab',prepare:autoScroll ?
            () => button.scrollIntoView?.({ block:'center',behavior:'instant' }) : null,
            apply:() => { button.click(); state.opened = keys[index]; } }] };
    }

    function lessonActions(component, scope, autoScroll = false) {
        if (component._component === 'tabs') return tabActions(scope,autoScroll);
        const selectors = {
            accordion:'button[aria-expanded="false"],[role=button][aria-expanded="false"],.accordion__item-btn',
            narrative:'[role=tab],.narrative__progress button',
            flipcard:'button,[role=button]'
        };
        const selector = selectors[component._component];
        if (!selector) return null;
        const controls = all(scope,selector).filter(enabledRendered);
        if (!controls.length) return { actions:[], supported:false,reason:component._component+' has no rendered lesson controls.' };
        const narrative = component._component === 'narrative';
        const pending = controls.filter(node => (narrative || !visited.has(node)) && !node.classList.contains('is-visited') &&
            (narrative || (!node.classList.contains('is-selected') && node.getAttribute('aria-selected') !== 'true')) && node.getAttribute('aria-expanded') !== 'true');
        const actionable = pending.filter(node => autoScroll || available(node));
        // Re-read after each slide: course widgets can replace their controls.
        return { supported:true,pending:pending.length > actionable.length,
            waiting:narrative && !pending.length,
            reason:narrative && !pending.length ? 'Slides are visited; waiting for the course to complete this narrative.' : undefined,
            actions:actionable.slice(0,1)
            .map(node => ({ node, label:'Open lesson item',prepare:autoScroll ?
                () => node.scrollIntoView?.({ block:'center',behavior:'instant' }) : null,
                apply:() => { node.click(); if (!narrative) visited.add(node); } })) };
    }

    function clickLabControl(node) {
        const doc = node.ownerDocument || document;
        const view = doc.defaultView || window;
        const originalOpen = view.open;
        const suppressOpen = () => null;
        const preventFileNavigation = event => {
            const path = event.composedPath?.() || [event.target];
            if (path.some(element => element?.matches?.('a[href]'))) event.preventDefault();
        };
        // Keep the normal click handlers, but suppress file navigation/new tabs
        // only during this synchronous lab click. Never change course records.
        doc.addEventListener('click',preventFileNavigation);
        try {
            view.open = suppressOpen;
            node.click();
        } finally {
            if (view.open === suppressOpen) view.open = originalOpen;
            doc.removeEventListener?.('click',preventFileNavigation);
        }
    }

    function mediaActions(scope) {
        const players = all(scope,'video,audio').filter(node => node.isConnected);
        if (players.length > 1) return { supported:false,actions:[],reason:'More than one media player is present.' };
        const player = players[0];
        const playButtons = all(scope,'button.vjs-big-play-button').filter(enabledRendered);
        if ((!player || player.paused) && playButtons.length === 1 && !visited.has(playButtons[0])) {
            const button = playButtons[0];
            return { supported:true,waiting:true,actions:[{ node:button,label:'Start video',prepare:() =>
                button.scrollIntoView?.({ block:'center',behavior:'instant' }),apply:() => {
                button.click(); visited.add(button);
            } }] };
        }
        if (!player) return { supported:true,waiting:true,actions:[],reason:'Video player is not accessible yet. Other visible activities can continue; press Play manually if needed.' };
        if (player.ended) return { supported:true,waiting:true,actions:[],reason:'Video ended; waiting for course completion.' };
        let playback = mediaPlayback.get(player);
        if (!playback) mediaPlayback.set(player,playback = {attempts:0,lastAttempt:null,pending:false,lastError:null,sequence:0});
        if (!player.paused) { playback.attempts = 0; playback.lastError = null; }
        const retryDelay = Math.min(30000,2000*2**Math.min(Math.max(0,playback.attempts-1),4));
        const canResume = () => player.isConnected && player.paused && !player.ended && !player.seeking &&
            (!playback.pending || now()-playback.lastAttempt >= 10000) &&
            (playback.lastAttempt === null || now()-playback.lastAttempt >= retryDelay);
        const resume = () => {
            if (!canResume() || typeof player.play !== 'function') return;
            playback.attempts++; playback.lastAttempt = now(); playback.pending = true;
            const sequence = ++playback.sequence;
            const settled = error => {
                if (playback.sequence !== sequence) return;
                playback.pending = false;
                playback.lastError = error ? String(error.name || 'Playback error')+': '+String(error.message || error).slice(0,160) : null;
                if (error && automatic) say('Playback did not start. Auto will retry; the browser may require pressing Play.');
            };
            try {
                const promise = player.play();
                if (typeof promise?.then === 'function') promise.then(() => settled(null),settled);
                else settled(null);
            } catch (error) { settled(error); }
        };
        if (Number.isFinite(player.duration) && player.duration > 0 && !soughtMedia.has(player)) {
            return { supported:true,waiting:true,actions:[{ node:scope,label:'Seek to the final second',apply:() => {
                if (!player.isConnected || player.ended) return;
                const target = Math.max(0,player.duration-1);
                try {
                    if (player.currentTime < target) player.currentTime = target;
                    soughtMedia.add(player); if (!player.seeking) resume();
                } catch { say('Video is not seekable yet; waiting for metadata.'); }
            } }] };
        }
        if (canResume() && typeof player.play === 'function') return { supported:true,waiting:true,
            actions:[{ node:scope,label:'Resume video playback',apply:resume }] };
        return { supported:true,waiting:true,actions:[],reason:player.paused ?
            player.seeking ? 'Waiting for video seeking to finish.' :
            playback.lastError ? 'Playback was blocked; Auto will retry. Press Play if the browser requires it.' :
            'Video is paused; Auto is waiting to retry playback.' : 'Waiting for video playback to finish.' };
    }

    function animationActions(scope) {
        if (isComplete(scope)) return {supported:true,actions:[]};
        const buttons = all(scope,'button,[role="button"]').filter(node => enabledRendered(node) && !node.closest('[data-na-answers]'));
        const timelines = all(scope,'input[type=range]').filter(enabledRendered);
        const label = node => (node.getAttribute('aria-label') || node.getAttribute('title') || labelText(node)).trim();
        const play = buttons.filter(node => /^play(?: animation)?$/i.test(label(node)));
        const button = play.length === 1 ? play[0] : buttons.length === 1 &&
            (!label(buttons[0]) || /^pause(?: animation)?$/i.test(label(buttons[0]))) ? buttons[0] : null;
        if (!button || timelines.length !== 1) return {supported:false,actions:[],
            reason:'Animation needs one identifiable playback button and one timeline.'};
        const timeline = timelines[0], time = now();
        const value = Number.isFinite(Number(timeline.value)) ? Number(timeline.value) : null;
        let state = animationPlayback.get(scope);
        if (!state || state.button !== button || state.timeline !== timeline) {
            state = {button,timeline,started:false,clicks:0,lastClick:null,lastValue:value,lastProgress:time};
            animationPlayback.set(scope,state);
        }
        if (value !== state.lastValue) {
            state.started = true; state.lastValue = value; state.lastProgress = time;
        }
        const maximum = Number(timeline.max || 100), minimum = Number(timeline.min || 0);
        const atEnd = value !== null && maximum > minimum && value >= maximum;
        const namedPlay = /^play(?: animation)?$/i.test(label(button));
        const namedPause = /^pause(?: animation)?$/i.test(label(button));
        const retryDelay = Math.min(30000,2000*2**Math.min(Math.max(0,state.clicks-1),4));
        const resume = namedPlay && time-state.lastProgress >= 10000 &&
            (state.lastClick === null || time-state.lastClick >= retryDelay);
        if (!atEnd && !namedPause && (!state.started || resume)) return {supported:true,waiting:true,
            actions:[{node:button,label:state.started ? 'Resume animation' : 'Play animation',
                prepare:() => button.scrollIntoView?.({block:'center',behavior:'instant'}),apply:() => {
                    if (!available(button) || !timeline.isConnected || isComplete(scope) || /^pause(?: animation)?$/i.test(label(button))) return;
                    // Playback may have started while the action was waiting.
                    const current = Number(timeline.value);
                    if (Number.isFinite(current) && current !== state.lastValue) {
                        state.started = true; state.lastValue = current; state.lastProgress = now(); return;
                    }
                    state.started = true; state.clicks++; state.lastClick = now();
                    state.lastProgress = now(); button.click();
                }}]};
        return {supported:true,waiting:true,actions:[],reason:atEnd ?
            'Animation reached its timeline end; waiting for course completion.' :
            state.started && time-state.lastProgress >= 10000 && !namedPlay && !namedPause ?
            'Animation has not advanced. Its unlabeled toggle was started once; check Play if it is paused.' :
            'Waiting for animation playback and course completion.'};
    }

    function labActions(component,scope,autoScroll = false) {
        if (!preferences.labs) return { supported:false, actions:[],reason:'Enable Lab downloads to open this lab.' };
        const files = new Set(itemsOf(component).map(item => item._downloadUrl || item.iframeurl)
            .filter(Boolean).map(path => new URL(path,document.baseURI || location.href).href));
        // Some labs expose a titled viewer button instead of a file link.
        // Resolve it only inside this lab widget, with a stable per-lab key.
        const dialogs = all(scope,'button.open-dialog').filter(enabledRendered);
        if (component._component === 'packetTracer' && dialogs.length) {
            const id = component._id || component.id;
            const key = id ? 'lab-dialog:'+id : files.size === 1 ? [...files][0] : null;
            if (dialogs.length !== 1 || itemsOf(component).length !== 1 || !key) return {
                supported:false,actions:[],reason:'Lab viewer button or lab identity is ambiguous.' };
            const button = dialogs[0];
            if (downloaded.has(key)) return { supported:true,actions:[] };
            if (!autoScroll && !available(button)) return { supported:true,actions:[],pending:true };
            return { supported:true,actions:[{ node:button,label:'Open lab viewer',prepare:autoScroll ?
                () => button.scrollIntoView?.({ block:'center',behavior:'instant' }) : null,
                apply:() => { clickLabControl(button); downloaded.add(key); } }] };
        }
        const links = all(scope,'a[href]').filter(link => available(link) && files.has(link.href));
        if (!links.length && files.size === 1) {
            const buttons = all(scope,'button,[role="button"]').filter(button => available(button) &&
                /^(?:download(?:\s+(?:file|lab|packet(?:\s+tracer)?))?|open\s+lab)$/i.test(
                    button.getAttribute('aria-label') || labelText(button)));
            if (buttons.length === 1) {
                const key = [...files][0];
                return { supported:true,actions:downloaded.has(key) ? [] : [{ node:buttons[0],label:'Open lab download',
                    apply:() => { clickLabControl(buttons[0]); downloaded.add(key); } }] };
            }
        }
        if (!links.length) return { supported:false, actions:[] };
        // One click per distinct file, even when the course re-renders its button.
        const unique = [...new Map(links.map(link => [link.href,link])).values()];
        return { supported:true, actions:unique.filter(link => !downloaded.has(link.href)).map(link => ({
            node:link, label:'Open lab download', apply:() => { clickLabControl(link); downloaded.add(link.href); }
        })) };
    }

    function assessmentStartActions(component,scope) {
        if (!preferences.submit) return { supported:false,actions:[],reason:'Enable Submit answers to start this assessment automatically.' };
        const text = component._labels?._introScreen?.startTestBtnLabel;
        const button = exactControl(scope,text || 'Start',true);
        if (!button) return { supported:false,actions:[],reason:'No unique enabled assessment Start control matches: '+plain(text || 'Start') };
        const last = assessmentStarts.get(button);
        const retryDelay = last ? Math.min(30000,10000*last.attempts) : 0;
        return { supported:true,waiting:true,reason:'Waiting for the assessment to open.',actions:last && now()-last.at < retryDelay ? [] : [{ node:button,label:'Start assessment',
            prepare:() => button.scrollIntoView?.({block:'center',behavior:'instant'}),apply:() => {
            if (!available(button) || assessmentQuestionButtons().length || exactControl(scope,text || 'Start',true) !== button) return;
            assessmentStarts.set(button,{at:now(),attempts:(last?.attempts || 0)+1});
            button.click();
        } }] };
    }

    function assessmentStrip(roots = rootsUnder()) {
        return roots.flatMap(root => queryAll(root,'button.block-button[aria-label]'))
            .filter(rendered).filter(button => /^(?:answered\s+|unanswered\s+|selected\s+)?Question\s+\d+$/i.test(button.getAttribute('aria-label') || ''));
    }

    function assessmentQuestionButtons(roots = rootsUnder()) {
        const labeled = assessmentStrip(roots);
        const unlabeled = roots.flatMap(root => queryAll(root,'button.block-button')).filter(rendered)
            .filter(button => !button.getAttribute('aria-label') && /^Q[1-9]\d*$/i.test(labelText(button)));
        return [...new Set([...labeled,...unlabeled])];
    }

    function assessmentAnswered(strip) {
        const numbers = strip.map(button => Number((button.getAttribute('aria-label') || '').match(/\d+$/)?.[0]));
        return strip.length > 0 && new Set(numbers).size === strip.length &&
            Math.max(...numbers) === strip.length && Math.min(...numbers) === 1 &&
            strip.every(button => /^answered\s+Question\s+\d+$/i.test(button.getAttribute('aria-label') || ''));
    }

    function nativeSubmissionReviewReady(roots) {
        // Secure exams omit answered aria-labels. Recognize their explicit
        // native Submit Page and a complete, unique Q1…Qn strip instead.
        // The course still controls whether final Submit becomes enabled.
        const reviews = roots.flatMap(root => queryAll(root,'button.review-screen-button.active-block'))
            .filter(rendered).filter(button => /^Submit Page$/i.test(button.getAttribute('aria-label') || labelText(button)));
        if (reviews.length !== 1) return false;
        const strip = assessmentQuestionButtons(roots);
        if (!strip.length || strip.some(button => button.getAttribute('aria-label') ||
            /(?:^|\s)active-block(?:\s|$)/.test(button.className || ''))) return false;
        const numbers = strip.map(button => Number(labelText(button).match(/^Q([1-9]\d*)$/i)?.[1]));
        return new Set(numbers).size === strip.length && Math.min(...numbers) === 1 && Math.max(...numbers) === strip.length;
    }

    function assessmentSubmissionPlan() {
        return withDOMReads(() => {
            const roots = rootsUnder();
            const buttons = roots.flatMap(root => queryAll(root,'.adaptive-assessment-submit')).filter(visible);
            if (!buttons.length) return null;
            const waiting = reason => ({supported:false,actions:[],reason});
            if (buttons.length !== 1) return waiting('More than one final assessment Submit control is visible.');
            if (!preferences.submit) return waiting('Assessment review is open. Enable Submit answers or confirm and submit manually.');
            const strip = assessmentStrip(roots);
            if (!assessmentAnswered(strip) && !nativeSubmissionReviewReady(roots)) {
                return waiting('Waiting for every question in the assessment strip to be answered.');
            }
            const submit = buttons[0];
            if (visited.has(submit)) return waiting('Assessment submitted. Waiting for the course results.');
            let container = composedParent(submit), confirmations = [];
            for (let depth=0; container && container !== document && depth<8; depth++,container=composedParent(container)) {
                // Keep confirmation bound to exactly this assessment's Submit.
                if (all(container,'.adaptive-assessment-submit').filter(rendered).length !== 1) break;
                confirmations = all(container,'input[type=checkbox],[role=checkbox]').filter(control => {
                    const labels = [...(control.labels || [])];
                    const texts = [control.getAttribute('aria-label') || '',...labels.map(labelText),
                        labelText(control.closest('label') || control.parentElement || control)];
                    return enabledRendered(control) && texts.some(text => /^Yes,?\s+confirm my submission\.?$/i.test(text.trim()));
                });
                if (confirmations.length) break;
            }
            if (confirmations.length !== 1) return waiting('Cannot identify one assessment submission confirmation checkbox.');
            const confirmation = confirmations[0];
            const checked = confirmation.checked === true || confirmation.getAttribute('aria-checked') === 'true';
            if (!checked) return {supported:true,actions:[{node:confirmation,label:'Confirm assessment submission',
                prepare:() => confirmation.scrollIntoView?.({block:'center',behavior:'instant'}),
                apply:() => confirmation.click()}]};
            if (!available(submit)) return waiting('Confirmation checked. Waiting for the course to enable Submit.');
            return {supported:true,actions:[{node:submit,label:'Submit assessment',apply:() => {
                submit.click(); visited.add(submit);
            }}]};
        });
    }

    async function handleAssessmentSubmission(token) {
        const route = location.href;
        const result = assessmentSubmissionPlan();
        if (!result) return false;
        activityStatus = {id:null,type:'assessmentSubmission',phase:'waiting'};
        if (!result.supported) { say(result.reason); return true; }
        const action = result.actions[0];
        action.prepare?.();
        if (!await waitForAction(delayMilliseconds(preferences.paced),token)) return true;
        // Confirmation may enable Submit, or the user may navigate away during
        // the delay. Rebuild the stage before performing the planned action.
        const current = assessmentSubmissionPlan();
        if (location.href !== route || !current?.supported || current.actions[0]?.node !== action.node || !available(action.node)) return true;
        if (await handleFeedbackPopup(token,automatic)) return true;
        activityStatus.phase = action.label; say(action.label+'…');
        current.actions[0].apply();
        return true;
    }

    function activityFinished(component,scope) {
        // The introduction is marked complete before Start is clicked. That
        // flag describes the intro screen, not the assessment attempt.
        if (component._component === 'adaptiveStartScreen') return assessmentQuestionButtons().length > 0;
        return isQuestion(component) ? questionFinished(component,scope) : isComplete(scope);
    }

    function isQuestion(component) {
        return ['mcq','gmcq','matching','matchingGraphic','fillBlanks','objectMatching','slider','stacker','yesNo'].includes(component._component);
    }

    function isComplete(scope) {
        return !!scope?.matches?.('.is-complete,.is-completed,[data-complete="true"],[data-completion="complete"]');
    }

    function questionFinished(component,scope) {
        if (isComplete(scope) || scope.matches('.is-submitted')) return true;
        const signature = String(component._id || component.id) + ':' + plain(component.body);
        if (submittedSignatures.get(scope) !== signature) return false;
        const submitted = submittedAssessmentContexts.get(scope);
        if (submitted && submitted.route === location.href) {
            const active = activeAssessmentIndex();
            if ((active !== null && active !== submitted.index) ||
                all(document,'button.review-screen-button.active-block').filter(rendered).length === 1) return true;
        }
        const controls = all(scope,'input[type=radio],input[type=checkbox],select,input[type=range]');
        return controls.length > 0 && controls.every(control => control.disabled);
    }

    function submitControls(scope,offscreen = false,broaden = false) {
        return withDOMReads(() => submitControlsNow(scope,offscreen,broaden),'Locate Submit control');
    }

    function submitControlsNow(scope,offscreen,broaden) {
        const usable = button => (offscreen ? enabledRendered(button) : available(button)) && !button.classList.contains('is-disabled');
        const find = container => {
            const explicit = all(container,'.js-btn-submit,button[type=submit],[data-action=submit]').filter(usable);
            if (explicit.length) return explicit;
            return all(container,'button,[role="button"]').filter(button => usable(button) &&
                (/^submit(?:\s+answers?)?$/i.test(labelText(button)) ||
                    /^submit(?:\s+answers?)?(?:\s+your answer will be submitted)?$/i.test(button.getAttribute('aria-label') || '')));
        };
        let current = scope;
        for (let depth = 0; current && depth < (broaden ? 5 : 1); depth++,current = composedParent(current)) {
            const found = find(current);
            if (found.length) return found;
        }
        if (broaden) {
            const global = find(document);
            // Only use a sibling/footer Submit if this is the only rendered question.
            const questions = [...components.values()].filter(component => isQuestion(component) && scopeFor(component,rootsUnder()));
            if (questions.length === 1 && global.length === 1) return global;
        }
        return [];
    }

    function navigationDocuments() {
        const documents = [document];
        try { if (window.parent && window.parent !== window && window.parent.document !== document) documents.push(window.parent.document); }
        catch { /* Cross-origin course shells cannot be inspected. */ }
        return documents;
    }

    // Read-only course navigation: evidence lives for this synchronous read only.
    // Auto owns delayed execution and asks again before acting on a destination.
    const courseNavigation = (() => {
        function shellDestination(doc) {
            const next = all(doc,'button,a[href],[role="button"]').filter(node => available(node) && shellNext(node));
            return next.length === 1 ? (next[0].getAttribute('aria-label') || '').replace(/^go to\s+/i,'').trim() : null;
        }

        function precedingSection(doc,destination) {
            const sections = all(doc,'button[id^="submodule-button-"]').filter(rendered);
            // Exam destinations may omit counts; completion belongs to the preceding section.
            const matches = sections.map((section,index) => ({index,text:labelText(section)}))
                .filter(entry => entry.text.startsWith(destination) && /^\s*(?:\d+\s*\/\s*\d+\s*)?$/.test(entry.text.slice(destination.length)));
            if (matches.length !== 1 || matches[0].index < 1) return null;
            const index = matches[0].index;
            return {sections,index,current:sections[index-1]};
        }

        function activeResults() {
            return all(document,'button.review-screen-button.active-block').filter(rendered)
                .filter(node => /^Result Page$/i.test(node.getAttribute('aria-label') || labelText(node))).length === 1;
        }

        function documentPageComplete(doc) {
            if (all(doc,'.page.is-complete,.page.is-completed,[data-page-complete="true"],[aria-current="page"][data-complete="true"]')
                .some(visible)) return true;
            return all(doc,'[aria-current="page"],[aria-current="true"]').some(current => visible(current) &&
                (isComplete(current) || isCompletionLabel(current.getAttribute('aria-label') || '') ||
                    !!current.querySelector('[aria-label="Completed"],[data-progress="100"]')));
        }

        function shellSectionComplete() {
            return navigationDocuments().some(doc => {
                // The shell's Next arrow names the destination. Its preceding outline
                // section is the current section; use that section's own counter.
                const destination = shellDestination(doc);
                if (!destination) return false;
                // Certification practice exams may live in a collapsed outline group,
                // so no destination leaf/counter is rendered. Bind completion to the
                // current route's own outline entry and the active assessment result.
                const currentId = new URL(location.href).hash.match(/\/courses\/[^/]+\/([^/]+)\/id\//)?.[1];
                if (currentId) {
                    const current = all(doc,'button[id^="node-button-"]').filter(rendered)
                        .filter(node => node.id === 'node-button-'+currentId);
                    const resultsReady = activeResults();
                    if (current.length === 1 && /100%\s*$/.test(labelText(current[0])) &&
                        resultsReady && assessmentAnswered(assessmentStrip())) return true;
                    // A route can own a group of exams whose aggregate is only 50%.
                    // Use explicit current-page completion, not the group's counter.
                    // Large result strips can render only their final question window.
                    if (current.length === 1 && resultsReady && navigationDocuments().some(documentPageComplete)) {
                        const strip = assessmentStrip();
                        const numbers = strip.map(button => Number((button.getAttribute('aria-label') || '').match(/\d+$/)?.[0]));
                        const answeredWindow = strip.length > 0 && new Set(numbers).size === strip.length &&
                            numbers.every(number => Number.isInteger(number) && number > 0) &&
                            strip.every(button => /^answered\s+Question\s+\d+$/i.test(button.getAttribute('aria-label') || ''));
                        const sections = all(doc,'button[id^="submodule-button-"]').filter(rendered)
                            .filter(node => node.id === 'submodule-button-'+currentId);
                        const targets = sections.map((node,index) => ({node,index}))
                            .filter(({node}) => labelText(node).replace(/\s*\d+\s*Pts\s*$/i,'').trim() === destination);
                        if (answeredWindow && targets.length === 1 && targets[0].index > 0 &&
                            /\bExam$/i.test(labelText(sections[targets[0].index-1]).replace(/\s*\d+\s*Pts\s*$/i,'').trim())) return true;
                    }
                }
                if (/^(?:Practice Final|Final|Checkpoint) Exam Modules\s+\d+\s*[-–]\s*\d+$/i.test(destination)) {
                    return topLevelExamReady(doc,destination);
                }
                if (/^Checkpoint Exam$/i.test(destination)) {
                    const currentModule = Number(new URL(location.href).searchParams.get('moduleNumber'));
                    if (!Number.isInteger(currentModule) || currentModule < 1) return false;
                    const outline = all(doc,'button[id^="node-button-"]').filter(rendered);
                    const current = outline.map((node,index) => ({node,index,text:labelText(node)}))
                        .filter(entry => new RegExp('^Module\\s+'+currentModule+':').test(entry.text));
                    if (current.length !== 1 || !/100%\s*$/.test(current[0].text)) return false;
                    const following = outline[current[0].index+1];
                    const range = following && labelText(following).match(/^Checkpoint Exam Modules\s+(\d+)\s*[-–]\s*(\d+)(?:\s*100%)?$/i);
                    return !!range && Number(range[1]) <= currentModule && Number(range[2]) === currentModule;
                }
                const introduction = destination.match(/^(\d+)\.0\.\s+Introduction$/i);
                if (introduction) {
                    const previous = Number(introduction[1])-1;
                    const modules = all(doc,'button[id^="node-button-"]').filter(rendered)
                        .filter(node => new RegExp('^Module\\s+'+previous+':').test(labelText(node)));
                    // At a module boundary the destination outline may be collapsed.
                    // Require the immediately previous numbered module's own 100%.
                    return modules.length === 1 && /100%\s*$/.test(labelText(modules[0]));
                }
                const previous = precedingSection(doc,destination);
                if (!previous) return false;
                const count = labelText(previous.current).match(/(\d+)\s*\/\s*(\d+)\s*$/);
                return !!count && Number(count[2]) > 0 && Number(count[1]) === Number(count[2]);
            });
        }

        function shellNext(node) {
            return /(?:^|\s)moduleNavBtn--\S+/.test(node.className || '') &&
                /(?:^|\s)next--\S+/.test(node.className || '') && /^go to\s+\S/i.test(node.getAttribute('aria-label') || '');
        }

        function topLevelExamReady(doc,destination) {
            const normalize = text => text.replace(/\s*100%\s*$/,'').replace(/\s*[-–]\s*/g,'-').trim();
            const outline = all(doc,'button[id^="node-button-"]').filter(rendered);
            const targets = outline.map((node,index) => ({node,index}))
                .filter(({node}) => normalize(labelText(node)) === normalize(destination));
            if (targets.length !== 1 || targets[0].index < 1) return false;
            const previous = labelText(outline[targets[0].index-1]);
            const module = previous.match(/^Module\s+(\d+):/i);
            if (module) {
                const currentModule = Number(new URL(location.href).searchParams.get('moduleNumber'));
                return Number(module[1]) === currentModule && /100%\s*$/.test(previous);
            }
            // A practice/checkpoint result can lead directly to another assessment.
            // Its own active results screen and complete numbered strip are required.
            if (!/^(?:Practice Final|Final|Checkpoint) Exam Modules\s+\d+\s*[-–]\s*\d+(?:\s*100%)?$/i.test(previous)) return false;
            return activeResults() && assessmentAnswered(assessmentStrip());
        }

        function outlineRecoveryPlan() {
            return withDOMReads(() => {
                for (const doc of navigationDocuments()) {
                    const destination = shellDestination(doc);
                    if (!destination) continue;
                    const previous = precedingSection(doc,destination);
                    if (!previous) continue;
                    const {sections,index:target,current} = previous, text = labelText(current);
                    const section = text.match(/^(\d+\.\d+)\.\s+/), count = text.match(/(\d+)\s*\/\s*(\d+)\s*$/);
                    if (!section || !count || Number(count[1]) >= Number(count[2])) continue;
                    let tree = composedParent(current);
                    while (tree && tree !== doc && !scopeContains(tree,sections[target])) tree = composedParent(tree);
                    if (!tree || tree === doc || tree === doc.body || tree === doc.documentElement) continue;
                    const prefix = section[1]+'.';
                    const entries = all(tree,'*').filter(rendered).map(node => ({node,text:(node.textContent || '').replace(/\s+/g,' ').trim()}))
                        .filter(entry => entry.text.startsWith(prefix) && entry.text.length < 300);
                    const groups = entries.filter(entry => {
                        const match = entry.text.match(/^(\d+\.\d+\.\d+)\s+.+?(\d+)\s*\/\s*(\d+)\s*$/);
                        if (!match || Number(match[2]) >= Number(match[3])) return false;
                        entry.prefix = match[1]+'.'; return true;
                    });
                    const group = groups[0];
                    if (!group) return {reason:'Outline section is incomplete, but no incomplete lesson group could be identified.',section:text};
                    const leaves = entries.filter(entry => entry.text.startsWith(group.prefix) &&
                        /^\d+(?:\.|\s)/.test(entry.text.slice(group.prefix.length)) &&
                        !entries.some(child => child !== entry && child.text === entry.text && scopeContains(entry.node,child.node)));
                    const candidates = leaves.map(entry => {
                        const explicit = entry.node.closest('button,a[href],[role=button],[role=treeitem],[tabindex="0"]');
                        const explicitText = (explicit?.textContent || '').replace(/\s+/g,' ').trim();
                        const clickable = explicit && explicitText === entry.text ? explicit :
                            (getComputedStyle(entry.node).cursor === 'pointer' ? entry.node : null);
                        return {...entry,clickable};
                    }).filter(entry => entry.clickable && enabledRendered(entry.clickable));
                    const first = candidates[0];
                    if (!first) return {reason:'Incomplete lesson found, but its outline link could not be resolved.',section:text,group:group.text};
                    const signature = destination+'|'+text+'|'+group.text;
                    return {node:first.clickable,label:first.text,signature,section:text,group:group.text,
                        attempted:outlineRecoveryAttempts.has(signature)};
                }
                return null;
            },'Find incomplete lesson in course outline');
        }

        function read(questionReady = false) {
            return withDOMReads(() => readNow(questionReady),'Resolve course Next');
        }

        function readNow(questionReady) {
            let shellReady;
            const shellComplete = () => shellReady ??= shellSectionComplete();
            const pageReady = navigationDocuments().some(documentPageComplete) || shellComplete();
            if (!pageReady && !questionReady) return {pageComplete:false,next:null};
            const candidates = navigationDocuments().flatMap(doc => all(doc,'button,a[href],[role="button"]'))
                .filter(node => available(node) && !node.closest('[data-na-answers]') && node.id !== HOST_ID)
                .filter(node => !node.matches('.js-narrative-controls-click,.narrative__controls-item'))
                .filter(node => {
                    const label = (node.getAttribute('aria-label') || node.getAttribute('title') || labelText(node)).trim();
                    if (shellNext(node)) return shellComplete();
                    return pageReady ? /^(?:next(?:\s+(?:page|module|section|lesson|activity|topic|question))?|continue)$/i.test(label) :
                        /^(?:next\s+question|continue\s+(?:quiz|assessment))$/i.test(label) ||
                        (/^next$/i.test(label) && !!node.closest('.assessment,.quiz,[data-assessment-id]'));
                });
            // A unique forward control avoids choosing between quiz and course navigation.
            return {pageComplete:pageReady,next:candidates.length === 1 ? candidates[0] : null};
        }

        return {read,recovery:outlineRecoveryPlan};
    })();

    async function recoverOutlineLesson(token) {
        const plan = courseNavigation.recovery();
        if (!plan) return false;
        if (!plan.node || plan.attempted) {
            say(plan.reason || 'Waiting for the course to record the earlier lesson visit. Outline: '+plan.group);
            navigationTrace.lastDecision = {reason:plan.reason || 'Outline recovery already attempted for this progress state.',section:plan.section,group:plan.group};
            return true;
        }
        plan.node.scrollIntoView?.({block:'center',behavior:'instant'});
        if (!await waitForAction(delayMilliseconds(preferences.paced),token)) return true;
        const current = courseNavigation.recovery();
        if (!current || current.signature !== plan.signature || current.node !== plan.node || !available(plan.node)) return true;
        if (outlineRecoveryAttempts.size >= 20) outlineRecoveryAttempts.delete(outlineRecoveryAttempts.values().next().value);
        outlineRecoveryAttempts.add(plan.signature);
        activityStatus = {id:null,type:'outlineRecovery',phase:'Return to '+plan.label};
        navigationTrace.lastDecision = {reason:'Returning to the beginning of an incomplete lesson group.',section:plan.section,group:plan.group,target:plan.label};
        say('Returning to earlier lesson: '+plan.label+'…'); plan.node.click();
        return true;
    }

    function isCompletionLabel(label) {
        return !/\b(?:not|incomplete)\b/i.test(label) && /\bcomplete(?:d)?\b|100%/i.test(label);
    }

    function rememberNavigation(node) {
        if (!node.href) return;
        const destination = new URL(node.href,location.href);
        const current = new URL(location.href);
        if (destination.origin !== current.origin || !/^https?:$/.test(destination.protocol)) return;
        if (destination.pathname === current.pathname && destination.search === current.search) return;
        try { sessionStorage.setItem(RESUME_KEY,JSON.stringify({ url:destination.href, expires:Date.now()+60000 })); }
        catch { /* SPA navigation still works without storage. */ }
    }

    function courseSessionId() {
        const url = new URL(location.href);
        const course = url.hash.match(/(?:^#|\/)courses\/([^/]+)/);
        if (course) return 'course:'+course[1];
        // The shell may use a launch URL; never carry intent to another launch.
        const launch = url.pathname === '/launch' && url.searchParams.get('id');
        return launch ? 'launch:'+launch : null;
    }

    function readAutoSession() {
        const course = courseSessionId();
        if (!course) return null;
        try {
            const saved = JSON.parse(sessionStorage.getItem(AUTO_SESSION_KEY) || 'null');
            return saved?.course === course && ['running','paused'].includes(saved.status) ?
                {course,status:saved.status} : null;
        } catch { return null; }
    }

    function saveAutoSession(status) {
        const course = courseSessionId();
        if (!course) return;
        try {
            if (status) sessionStorage.setItem(AUTO_SESSION_KEY,JSON.stringify({course,status}));
            else if (readAutoSession()) sessionStorage.removeItem(AUTO_SESSION_KEY);
        } catch { /* Auto still works in this frame if session storage is blocked. */ }
    }

    function resumePending() {
        if (automatic) return false;
        const session = readAutoSession();
        if (session) return session.status === 'running';
        try {
            const resume = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null');
            if (!resume) return false;
            if (resume.expires <= Date.now()) { sessionStorage.removeItem(RESUME_KEY); return false; }
            if (resume.url !== location.href) return false;
            sessionStorage.removeItem(RESUME_KEY);
            return true;
        } catch { return false; }
    }

    function scrollForward(anchor) {
        return withDOMReads(() => scrollForwardNow(anchor),'Find and scroll lesson container');
    }

    function scrollForwardNow(anchor) {
        let current = anchor;
        while (current && current !== document) {
            if (current.clientHeight > 0 && current.scrollHeight > current.clientHeight+4 &&
                /auto|scroll/.test(getComputedStyle(current).overflowY)) break;
            current = current.parentNode || current.host;
        }
        let scroller = current && current !== document ? current : document.scrollingElement;
        if (!scroller || scroller.scrollHeight <= scroller.clientHeight+4) {
            const candidates = all(document,'*').filter(node => node.id !== HOST_ID && visible(node) &&
                node.clientHeight > 100 && node.scrollHeight > node.clientHeight+4 &&
                !node.closest('nav,aside,[role=navigation]') && /auto|scroll/.test(getComputedStyle(node).overflowY))
                .filter(node => node.getBoundingClientRect().width > innerWidth*.4);
            candidates.sort((a,b) => b.clientHeight*b.getBoundingClientRect().width-a.clientHeight*a.getBoundingClientRect().width);
            scroller = candidates[0];
        }
        if (!scroller || scroller.scrollTop+scroller.clientHeight >= scroller.scrollHeight-4) return false;
        scroller.scrollBy({ top:Math.max(100,scroller.clientHeight*.7),behavior:'instant' });
        return true;
    }

    async function continueCourse(questionReady,anchor,token,signature) {
        const decision = reason => { navigationTrace.lastDecision = {reason,url:location.href,at:new Date().toISOString()}; };
        if (!preferences.navigate || token !== generation) {
            decision(!preferences.navigate ? 'Continue through course is disabled.' : 'Pending action was cancelled.');
            return false;
        }
        const unfinished = unfinishedActivities();
        const next = pendingQuestions.size || unfinished.length ? null : courseNavigation.read(questionReady).next;
        decision(pendingQuestions.size ? 'Unfinished questions block Next.' : unfinished.length ?
            'Unfinished lesson activities block Next.' : !next ?
            'No unique enabled Next control passes the completion and outline checks.' :
            navigationSignatures.get(next) === signature ? 'Next was already clicked for this page context.' : 'Next is ready.');
        if (next && navigationSignatures.get(next) !== signature) {
            const route = location.href;
            const label = next.getAttribute('aria-label') || labelText(next);
            if (!await waitForAction(delayMilliseconds(preferences.paced),token) || !available(next)) return false;
            // SPA shells may reuse the same Next element for a different
            // section while an action is waiting. Validate its context again.
            if (location.href !== route || (next.getAttribute('aria-label') || labelText(next)) !== label ||
                pendingQuestions.size || unfinishedActivities().length || courseNavigation.read(questionReady).next !== next) return false;
            navigationSignatures.set(next,signature);
            navigationTrace.lastClick = {label,url:location.href,at:new Date().toISOString()};
            rememberNavigation(next); pendingQuestions.clear(); activePairs.clear();
            say('Continuing to the next activity…');
            next.click(); return true;
        }
        if (document.visibilityState !== 'hidden' && scrollForward(anchor)) {
            say('Looking for the next activity on this page…'); return true;
        }
        if (document.visibilityState !== 'hidden' && recoverIncompleteActivity()) return true;
        if (document.visibilityState !== 'hidden' && await recoverOutlineLesson(token)) return true;
        return false;
    }

    function requiresCompletion(component) {
        // Dynamic graphics are rendering assets inside lesson widgets, not
        // independently completable activities. Their owning graphic/tab/etc.
        // remains subject to its normal completion checks.
        return componentAvailable(component) && !component._isOptional &&
            !['quicknav','assessmentResults','dynamic-graphic'].includes(component._component);
    }

    function componentAvailable(component) {
        if (!questionCapture.matchesPage(component._id || component.id)) return false;
        return component._isAvailable !== false && component._isVisible !== false &&
            !component._isHidden && !component._isDeleted;
    }

    function unfinishedActivities(roots) {
        return withDOMReads(() => unfinishedActivitiesNow(roots || rootsUnder()),'Discover unfinished activities');
    }

    function unfinishedActivitiesNow(roots) {
        const result = [];
        for (const component of components.values()) {
            if (!requiresCompletion(component)) continue;
            const scope = scopeFor(component,roots,false);
            if (!scope || !rendered(scope) ||
                activityFinished(component,scope)) continue;
            result.push({ component,scope });
        }
        return result;
    }

    function recoverIncompleteActivity() {
        for (const {component,scope} of unfinishedActivities()) {
            if (visible(scope)) continue;
            const controls = all(scope,component._component === 'media' ?
                'button.vjs-big-play-button,video,audio' : CONTROL_SELECTOR).filter(enabledRendered);
            const target = controls[0] || scope;
            if (!target.scrollIntoView) continue;
            target.scrollIntoView({ block:'center',behavior:'instant' });
            activityStatus = { id:component._id || component.id,type:component._component,phase:'recovering' };
            say('Returning to unfinished '+(component._component === 'media' ? 'video' : 'lesson activity')+'…');
            return true;
        }
        return false;
    }

    function plan(component, scope, lessons) {
        return withDOMReads(() => planNow(component,scope,lessons),'Plan '+component._component+' '+(component._id || component.id || ''));
    }

    function planNow(component, scope, lessons) {
        switch (component._component) {
            case 'mcq': case 'gmcq': return choiceActions(component,scope,lessons);
            case 'matching': case 'matchingGraphic': case 'fillBlanks': return selectActions(component,scope,lessons);
            case 'objectMatching': return connectionActions(component,scope,lessons);
            case 'slider': return sliderActions(component,scope);
            case 'stacker': case 'yesNo': return { actions:[], supported:false };
            case 'media': return lessons ? mediaActions(scope) : null;
            case 'adobe-animate': return lessons ? animationActions(scope) : null;
            case 'packetTracer': return lessons ? labActions(component,scope,lessons) : null;
            case 'adaptiveStartScreen': return lessons ? assessmentStartActions(component,scope) : null;
            default:return lessons ? lessonActions(component,scope,lessons) : null;
        }
    }

    function delayMilliseconds(paced, random = Math.random) {
        return paced ? 650 + Math.floor(random() * 1150) : 90;
    }

    function waitForAction(ms, token) {
        return new Promise(resolve => {
            const end = Date.now() + ms;
            const poll = () => token !== generation ? resolve(false) :
                Date.now() >= end ? resolve(true) : setTimeout(poll,Math.min(50,end-Date.now()));
            poll();
        });
    }

    function syncButtons() {
        if (!panel) return;
        const auto = panel.querySelector('#auto');
        auto.textContent = automatic ? 'Stop auto' : 'Start auto';
        auto.className = automatic ? 'stop' : 'primary';
        panel.querySelector('#fill').textContent = running && !automatic ? 'Cancel fill' : 'Fill visible';
        panel.querySelector('#fill').disabled = automatic;
    }

    function stop() {
        automatic = false; generation++;
        saveAutoSession(null);
        pendingDropdown = null;
        clearTimeout(autoTimer);
        try { sessionStorage.removeItem(RESUME_KEY); } catch {}
        syncButtons();
        say('Stopped. You can continue manually.');
    }

    function startAuto() {
        refreshSuspended = false; diagnostics.pause = null;
        controlFailures = 0;
        clearTimeout(autoTimer);
        automatic = true; generation++;
        saveAutoSession('running');
        syncButtons();
        if (!running) runBatch(true);
    }

    function feedbackCloseControls() {
        return withDOMReads(feedbackCloseControlsNow);
    }

    function feedbackCloseControlsNow() {
        // Only the course notification popup, never the shell/course Close.
        return navigationDocuments().flatMap(doc => all(doc,'button.js-notify-close-btn')).filter(available);
    }

    async function handleFeedbackPopup(token, dismiss) {
        const controls = feedbackCloseControls();
        if (!controls.length) return false;
        if (dismiss && controls.length === 1) {
            if (await waitForAction(delayMilliseconds(preferences.paced),token) && available(controls[0])) {
                controls[0].click();
                say('Closed course feedback. Continuing on the next check…');
            }
        } else say('Course feedback is open. Close the popup to continue.');
        return true;
    }

    function visibleActivities(roots) {
        return withDOMReads(() => visibleActivitiesNow(roots),'Discover visible activities');
    }

    function visibleActivitiesNow(roots, models = [...components.values()]) {
        const entries = [];
        for (const component of models) {
            const entry = visibleActivity(component,roots);
            if (entry) entries.push(entry);
        }
        return entries.sort(compareActivities);
    }

    function compareActivities(a,b) {
        return Number(a.footerOnly)-Number(b.footerOnly) || a.top-b.top;
    }

    function visibleActivity(component,roots) {
        if (!componentAvailable(component)) return null;
        const scope = scopeFor(component,roots);
        if (!scope) return null;
        const media = component._component === 'media';
        const controls = all(scope,media ? 'button.vjs-big-play-button,video,audio' : CONTROL_SELECTOR).filter(available);
        let top = Infinity;
        for (const control of controls) top = Math.min(top,control.getBoundingClientRect().top);
        return {component,scope,footerOnly:media && !controls.length,
            top:controls.length ? top : Math.max(0,scope.getBoundingClientRect().top)};
    }

    async function discoverActivities(token) {
        const models = [...components.values()].filter(componentAvailable), entries = [], pending = new Set();
        const route = location.href;
        const summary = {components:models.length,processed:0,batches:0,yields:0,milliseconds:0,cancelled:null};
        diagnostics.discovery = summary;
        const started = now();
        const cancelled = () => token !== generation ? 'stopped or restarted' :
            location.href !== route ? 'route changed' : document.visibilityState === 'hidden' ? 'tab hidden' : null;
        let offset = 0;
        try {
            while (offset < models.length) {
                if ((summary.cancelled = cancelled())) return null;
                summary.batches++;
                withDOMReads(() => {
                    // Roots and memoized DOM reads belong to this chunk only.
                    const roots = rootsUnder(), sliceStarted = now();
                    let count = 0;
                    while (offset < models.length && count++ < DISCOVERY_BATCH_SIZE) {
                        const component = models[offset++];
                        if (isQuestion(component) && requiresCompletion(component)) {
                            const scope = scopeFor(component,roots,false);
                            if (scope && rendered(scope) && !questionFinished(component,scope))
                                pending.add(String(component._id || component.id));
                        }
                        const entry = visibleActivity(component,roots);
                        if (entry) entries.push(entry);
                        summary.processed = offset;
                        if (now()-sliceStarted >= DISCOVERY_SLICE_MS) break;
                    }
                },'Discover pending and visible activities');
                if (offset < models.length) {
                    summary.yields++;
                    await new Promise(resolve => setTimeout(resolve,0));
                }
            }
            if ((summary.cancelled = cancelled())) return null;
            pendingQuestions.clear();
            for (const id of pending) pendingQuestions.add(id);
            return entries.filter(entry => entry.scope.isConnected).sort(compareActivities);
        } catch (error) {
            summary.cancelled = error.name === 'HelperScanBudgetExceeded' ? 'scan budget' : 'scan error';
            throw error;
        } finally {
            summary.milliseconds = Number((now()-started).toFixed(2));
        }
    }

    async function runBatch(lessons) {
        if (running) return;
        running = true; syncButtons();
        const token = generation;
        const route = location.href;
        let performed = 0, unsupported = 0, seen = 0, failed = 0;
        const blockers = [];
        let questionReady = false, anchor = null, waitingForCompletion = false;
        const visibleIds = [];
        let controlError = false;
        try {
            activityStatus = null;
            if (automatic) diagnostics.counters.autoTicks++;
            if (document.visibilityState === 'hidden') return;
            if (await handleFeedbackPopup(token,automatic)) return;
            if (lessons && await handleAssessmentSubmission(token)) return;
            const activities = await discoverActivities(token);
            if (!activities || token !== generation) return;
            if (assessmentQuestionButtons().length &&
                !activities.some(({component}) => isQuestion(component)) &&
                !all(document,'button.review-screen-button.active-block').some(rendered)) {
                activityStatus = {id:null,type:'assessmentQuestion',phase:'missing schema'};
                say('Assessment is open, but no supported question data matches this page. Reload once to capture its requests; if this persists, copy Debug report.');
                return;
            }
            for (const {component,scope} of activities) {
                if (token !== generation || location.href !== route) return;
                if (!visible(scope)) continue;
                if (automatic && performed) break;
                anchor = scope;
                const id = String(component._id || component.id);
                const signature = id + ':' + plain(component.body);
                visibleIds.push(id);
                if (activityFinished(component,scope)) {
                    pendingQuestions.delete(id);
                    if (isQuestion(component)) questionReady = true;
                    continue;
                }
                if (isQuestion(component) && requiresCompletion(component)) pendingQuestions.add(id);
                const result = plan(component,scope,lessons);
                if (!result) {
                    if (scope.matches('.is-question')) {
                        seen++; unsupported++;
                        activityStatus = {id,type:component._component,phase:'unsupported question'};
                        blockers.push('Unsupported question type: '+component._component+'.');
                        if (automatic) break;
                    }
                    continue;
                }
                seen++;
                activityStatus = { id,type:component._component,phase:'planning' };
                if (!result.supported) {
                    unsupported++; activityStatus.phase = 'needs interaction';
                    blockers.push(result.reason || component._component+' controls could not be resolved.');
                    if (automatic && component._component !== 'media') break;
                    continue;
                }
                let componentFailed = false;
                for (const action of result.actions) {
                    if (token !== generation || location.href !== route) return;
                    if (automatic && action.prepare) action.prepare();
                    if (!await waitForAction(delayMilliseconds(preferences.paced),token)) break;
                    if (location.href !== route) return;
                    if (await handleFeedbackPopup(token,automatic)) return;
                    if (token !== generation || location.href !== route) return;
                    if (!available(action.node)) { failed++; componentFailed = true; break; }
                    say(action.label + '…');
                    activityStatus.phase = action.label;
                    action.apply(); performed++;
                    if (feedbackCloseControls().length) { say('Course feedback opened; pausing interactions…'); return; }
                }
                if (token !== generation || location.href !== route) return;
                if (automatic && componentFailed) break;
                if (result.waiting) {
                    waitingForCompletion = true;
                    activityStatus.phase = 'waiting';
                    blockers.push(result.reason || 'Waiting for video playback…');
                    if (automatic && component._component !== 'media') break;
                    continue;
                }
                if (preferences.submit && !componentFailed && available(scope) &&
                    ['mcq','gmcq','matching','matchingGraphic','fillBlanks','objectMatching','slider'].includes(component._component)) {
                    // Re-read controls after interaction; never submit a stale plan.
                    const remaining = plan(component,scope,automatic);
                    if (!remaining?.supported || remaining.actions.length || remaining.pending) continue;
                    const submit = submitControls(scope,automatic,true);
                    if (automatic && submit.length === 1 && !available(submit[0])) submit[0].scrollIntoView?.({ block:'center',behavior:'instant' });
                    if (submit.length === 1 && submittedSignatures.get(scope) !== signature &&
                        await waitForAction(delayMilliseconds(preferences.paced),token) && available(submit[0])) {
                        if (location.href !== route) return;
                        if (await handleFeedbackPopup(token,automatic)) return;
                        if (token !== generation || location.href !== route || !available(submit[0])) return;
                        const assessmentIndex = activeAssessmentIndex();
                        submit[0].click(); submittedSignatures.set(scope,signature);
                        if (assessmentIndex !== null) submittedAssessmentContexts.set(scope,{index:assessmentIndex,route});
                        performed++;
                        if (feedbackCloseControls().length) { say('Answer submitted. Course feedback opened…'); return; }
                    } else if (!submit.length) blockers.push('Answers filled; no enabled Submit control found.');
                    else if (submit.length > 1) blockers.push('More than one Submit control matches this question.');
                }
                // A click can re-render widgets or move the viewport. Rebuild
                // scopes on the next tick instead of acting on another widget.
                if (automatic && performed) break;
            }
            if (automatic && token === generation && !performed && !unsupported && !failed && !waitingForCompletion &&
                await continueCourse(questionReady,anchor,token,location.href+':'+visibleIds.join(','))) return;
            if (token === generation) say(!seen ? (questionReady ?
                'Visible questions are complete. Next is waiting for the course outline to confirm this section is complete.' :
                'No supported activity is visible. Scroll to an activity.') :
                (performed ? performed + ' interactions performed.' : unsupported ? 'Activity could not be resolved.' : 'No pending supported interactions.') +
                (blockers.length ? ' '+[...new Set(blockers)].join(' ') : '') +
                (pendingQuestions.size && !preferences.submit ? ' Enable Submit answers or submit manually to continue.' : '') +
                (failed ? ' A control changed; try again.' : '') + (automatic ? ' Auto is watching this page.' : ' Review before submitting.'));
        } catch (error) {
            if (error.name === 'HelperScanBudgetExceeded') return;
            if (token !== generation) return;
            if (automatic) {
                controlError = true;
                controlFailures = Math.min(controlFailures+1,100);
                const retryMilliseconds = Math.min(30000,1000*2**Math.min(controlFailures-1,5));
                diagnostics.lastControlError = {at:new Date().toISOString(),message:String(error.message || error).slice(0,200),
                    consecutive:controlFailures,retryMilliseconds};
                if (controlFailures === 1) console.warn('[Course Helper] Retrying after a control error:',error);
                say('A course control changed. Auto will retry in '+retryMilliseconds/1000+' seconds.');
            } else {
                console.warn('[Course Helper] Fill interrupted after a control error:',error);
                say('A course control changed. Retry Fill visible or start Auto.');
            }
        } finally {
            if (!controlError) controlFailures = 0;
            running = false; syncButtons();
            if (automatic) autoTimer = setTimeout(() => runBatch(true),controlError ? diagnostics.lastControlError.retryMilliseconds :
                document.visibilityState === 'hidden' ? 5000 : 1000);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',scheduleRefresh,{ once:true });
    else scheduleRefresh();
    document.addEventListener('visibilitychange',() => {
        if (diagnostics.capture && !diagnostics.capture.endedAt) diagnostics.capture.ignoreNextPulse = true;
        if (document.visibilityState !== 'hidden') scheduleRefresh();
    });
    // Frame replacement ends this worker, but an explicitly started course Auto
    // session survives in this tab. Stop and pauses update that intent separately.
    window.addEventListener('pagehide',() => { automatic = false; generation++; clearTimeout(autoTimer); stopPerformanceCapture(); });
    window.addEventListener('pageshow',scheduleRefresh);
})();
