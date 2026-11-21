const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../script'), 'utf8');

function node(text = '', attributes = {}) {
    const children = new Map();
    return {
        textContent: text, isConnected: true, disabled: false, clicks: 0,
        classList: { contains: () => false }, children,
        getAttribute: key => attributes[key] ?? null,
        setAttribute: (key,value) => { attributes[key] = value; },
        removeAttribute: key => { delete attributes[key]; },
        closest: () => null, matches: () => false,
        querySelectorAll: selector => children.get(selector) || [],
        querySelector: selector => (children.get(selector) || [])[0] || null,
        cloneNode: () => ({ textContent: text, querySelectorAll: () => [] }),
        getClientRects: () => [{}],
        getBoundingClientRect: () => ({ top: 10, bottom: 50, left: 10, right: 200 }),
        click() { this.clicks++; }, dispatchEvent() {},
    };
}

function boot(body = '[]', options = {}) {
    const storage = new Map(Object.entries(options.storage || {}));
    const session = options.session || new Map();
    const windowListeners = new Map();
    const original = new Response(body, { headers: options.headers, status: options.status || 200 });
    let requests = 0;
    const document = {
        readyState: 'loading', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
        createElement(tag) {
            assert.equal(tag, 'template');
            return {
                content: { textContent: '' },
                set innerHTML(value) {
                    this.content.textContent = String(value).replace(/<[^>]*>/g, '')
                        .replace(/&(amp|nbsp|lt|gt|quot|#39);/g, (_, entity) =>
                            ({amp:'&',nbsp:' ',lt:'<',gt:'>',quot:'"','#39':"'"})[entity]);
                }
            };
        }
    };
    const window = { XMLHttpRequest:options.XMLHttpRequest, fetch: async (...args) => { requests++; return options.fetch ? options.fetch(...args) : original; }, addEventListener:(name,listener) => windowListeners.set(name,listener),
        matchMedia: () => ({ matches:options.dark === true }) };
    const location = { href:options.url || 'https://www.netacad.com/launch' };
    const context = vm.createContext({
        document, window, location,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (k,v) => storage.set(k,v) },
        sessionStorage: { getItem: key => session.get(key) ?? null, setItem: (k,v) => session.set(k,v), removeItem: key => session.delete(key) },
        Response, Headers, URL, Event, setTimeout:options.setTimeout || setTimeout,
        clearTimeout:options.clearTimeout || clearTimeout, Map:options.Map || Map,
        performance:options.performance,
        PerformanceObserver:options.PerformanceObserver,
        getComputedStyle: () => ({ visibility:'visible',display:'block',overflowY:options.overflowY || 'visible' }),
        innerHeight: 800, innerWidth: 1200, CSS: { escape: value => value },
        console: { warn() {} }
    });
    vm.runInContext((options.source || source).replace(/\}\)\(\);\s*$/, `
        globalThis.helper = { answerPairs, decorate, selectionAction, connectionActions,
            choiceActions, selectActions, plan, delayMilliseconds, waitForAction, stop,
            rootsUnder, scopeFor, available, components, runBatch, startAuto, getPreferences: () => preferences,
            effectiveTheme, clampPosition, installPanelDrag, labelText,
            labActions, isComplete, continueCourse, resumePending,
            rememberNavigation, handleConnectionSelection, updatePairHighlights,
            questionFinished, isCompletionLabel, submitControls, pendingCount: () => pendingQuestions.size,
            rendered, enabledRendered, scrollForward, widgetScope, customSelectActions, debugReport,
            pendingQuestions, recoverIncompleteActivity, unfinishedActivities, visibleActivities,
            feedbackCloseControls, handleFeedbackPopup, lessonActions, connectionConfirmed, mediaActions, clickLabControl, graphicBindings, refreshGraphicGuides, imageMatchesItem,
            withDOMReads:typeof withDOMReads === 'function' ? withDOMReads : null, all,
            courseMutations:typeof courseMutations === 'function' ? courseMutations : null, plain,
            assessmentSubmissionPlan:typeof assessmentSubmissionPlan === 'function' ? assessmentSubmissionPlan : null,activityFinished,
            performanceReport:typeof performanceReport === 'function' ? performanceReport : null,
            startPerformanceCapture:typeof startPerformanceCapture === 'function' ? startPerformanceCapture : null,
            stopPerformanceCapture:typeof stopPerformanceCapture === 'function' ? stopPerformanceCapture : null,
            scheduleRefresh,
            discoverActivities: () => discoverActivities(generation),
            runAutoOnce: async () => { automatic = true; try { await runBatch(true); } finally { automatic = false; clearTimeout(autoTimer); } },
            setPanel: value => panel = value };
    })();`), context);
    return { helper: context.helper, window, windowListeners, original, document, location, session, storage, requests: () => requests };
}

module.exports = { boot,node,source };
