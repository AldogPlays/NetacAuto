// Optional baseline: node tests/performance.cjs /path/to/previous-userscript.js
// Counts mocked DOM operations, not browser frame time or layout cost.
const fs = require('node:fs');
const {performance} = require('node:perf_hooks');
const {boot,node,source} = require('./harness.cjs');

function measure(script) {
    const env = boot('[]',{source:script});
    const counts = {queries:0,clones:0};
    const candidates = Array.from({length:30},(_,i) => {
        const entry = node('Rendered question '+i,{class:'question'});
        entry.id = 'runtime-'+i;
        const clone = entry.cloneNode;
        entry.cloneNode = (...args) => { counts.clones++; return clone(...args); };
        return entry;
    });
    const filler = Array.from({length:2970},(_,i) => {
        const entry = node('',{class:'course-content'}); entry.id = 'content-'+i; return entry;
    });
    const nodes = [...candidates,...filler];
    env.document.querySelectorAll = selector => {
        counts.queries++;
        if (selector === '*') return nodes;
        if (selector === 'fieldset,.question,.mcq,[data-question-id]') return candidates;
        return [];
    };
    env.document.querySelector = () => { counts.queries++; return null; };
    for (let i=0; i<1000; i++) env.helper.components.set('old-'+i,{
        _id:'old-'+i,_component:'mcq',body:'Previously loaded question '+i,_items:[]
    });
    const start = performance.now();
    env.helper.visibleActivities([env.document]);
    return {...counts,elapsedMs:Number((performance.now()-start).toFixed(2))};
}

function measureEmptyRoots(script) {
    const {helper} = boot('[]',{source:script});
    let queries = 0;
    const roots = Array.from({length:200},() => ({nodeType:11,
        querySelectorAll:() => { queries++; return []; },
        querySelector:() => { queries++; return null; }}));
    const scan = () => {
        for (let i=0;i<500;i++) helper.scopeFor({_id:'old-'+i,_component:'text'},roots,false);
    };
    const start = performance.now();
    if (helper.withDOMReads) helper.withDOMReads(scan); else scan();
    return {queries,elapsedMs:Number((performance.now()-start).toFixed(2))};
}

function measureRootRouting(script) {
    let lookups = 0;
    class CountedMap extends Map { get(key) { lookups++; return super.get(key); } }
    const {helper} = boot('[]',{source:script,Map:CountedMap});
    const roots = Array.from({length:200},(_,i) => {
        const entry = node('',{class:'content'}); entry.id = 'content-'+i;
        return {nodeType:11,querySelectorAll:selector => selector === '*' ? [entry] : []};
    });
    const start = performance.now();
    helper.withDOMReads(() => {
        for (let i=0;i<500;i++) helper.scopeFor({_id:'old-'+i,_component:'text'},roots,false);
    });
    return {mapLookups:lookups,elapsedMs:Number((performance.now()-start).toFixed(2))};
}

if (require.main === module) {
    if (process.argv[2]) {
        const baseline = fs.readFileSync(process.argv[2],'utf8');
        console.log('baseline',measure(baseline));
        console.log('baseline empty roots',measureEmptyRoots(baseline));
        console.log('baseline root routing',measureRootRouting(baseline));
    }
    console.log('current ',measure(source));
    console.log('current empty roots ',measureEmptyRoots(source));
    console.log('current root routing',measureRootRouting(source));
}
module.exports = {measure,measureEmptyRoots};
