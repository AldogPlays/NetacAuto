// Browser APIs are mocked; these checks do not replace live course testing.
// Assessment prompts, answer data, IDs and asset paths are synthetic examples.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot,node,source } = require('./harness.cjs');

const fixture = {
    _id: 'synthetic-matching-question', _component: 'objectMatching',
    body: '<p>Match each invented workshop action to its numbered stage.</p>',
    _isQuestionRandom: true, _isAnswerRandom: false,
    _items: [
        { question: 'Gather the clay.', answer: 'Step 1', questionBGColor: '#F9D8D6' },
        { question: 'Shape the vessel.', answer: 'Step 2' },
        { question: 'Let the vessel rest.', answer: 'Step 3' },
        { question: 'Paint the outer surface.', answer: 'Step 4' },
        { question: 'Polish the finished vessel.', answer: 'Step 5' },
        { question: 'Place the vessel on a shelf.', answer: 'Step 6' }
    ]
};
const controlSelector = 'label,button,[role="button"],[role="radio"],[role="checkbox"],[tabindex="0"]';
const clone = value => JSON.parse(JSON.stringify(value));
const secureQuestion = require('./fixtures/secure-question.json');
const secureQuestionTwo = require('./fixtures/secure-question-two.json');
const secureAnswerNext = require('./fixtures/secure-answer-next.json');

test('answerQuestion captures nested choose-three data and decorates only its agreed choices without changing scoring', async () => {
    const env = boot(JSON.stringify(secureAnswerNext),{status:201,headers:{'content-type':'application/json'}});
    const response = await env.window.fetch('https://ssac-backend.netacad.com/v3/answerQuestion/');
    const data = await response.json(), source = secureAnswerNext.nextQuestion.component;
    assert.deepEqual(data.nextQuestion.component._items.map(item => item.text.includes('data-na-correct')),[true,false,true,true,false,false]);
    data.nextQuestion.component._items = clone(source._items);
    assert.deepEqual(data,secureAnswerNext);
    assert.deepEqual(clone(env.helper.components.get(source._id)),source);
    assert.equal(env.helper.components.has('previous-question'),false);
    assert.equal(env.requests(),1);
});

function secureCheckboxQuestion(component = clone(secureAnswerNext.nextQuestion.component)) {
    const env = boot(), scope = node(), submit = node('Submit',{'aria-label':'submit'});
    const labels = component._items.map(item => {
        const label = node(item.text);
        label.control = {type:'checkbox',checked:false,clicks:0,click() {
            this.clicks++; this.checked = !this.checked;
            submit.disabled = labels.filter(label => label.control.checked).length !== component._selectable;
        }};
        return label;
    });
    scope.children.set(controlSelector,[...labels].reverse());
    env.document.querySelector = () => scope;
    env.document.querySelectorAll = selector => selector === 'button,[role="button"]' ? [submit] : [];
    env.helper.components.set(component._id,component);
    env.helper.getPreferences().paced = false; env.helper.getPreferences().submit = true;
    submit.disabled = true;
    submit.click = () => { submit.clicks++; scope.matches = selector => selector === '.is-submitted'; };
    return {...env,scope,submit,labels,component};
}

test('Auto clears an incorrect checkbox then selects the three SMV choices in shuffled labels and submits once', async () => {
    const env = secureCheckboxQuestion();
    env.labels[5].control.checked = true;
    const before = JSON.stringify(env.component);
    await env.helper.runAutoOnce();
    await env.helper.runAutoOnce();
    assert.deepEqual(env.labels.map(label => label.control.checked),[true,false,true,true,false,false]);
    assert.equal(env.labels[5].control.clicks,1);
    assert.equal(env.submit.clicks,1);
    assert.equal(JSON.stringify(env.component),before);
});

test('the observed SMV list grammar also resolves exactly two required checkbox choices', async () => {
    const component = clone(secureAnswerNext.nextQuestion.component);
    component._selectable = 2;
    component._smvWiseScoring.outcomes.interpretvar = [
        {interpret:'1 point for Option 1, Option 40 points for any other option'},
        {interpret:'Option 1 and Option 4 are correct.1 point for each correct option.0 points if more options are selected than required.'}
    ];
    const env = secureCheckboxQuestion(component);
    await env.helper.runAutoOnce();
    assert.deepEqual(env.labels.map(label => label.control.checked),[true,false,false,true,false,false]);
    assert.equal(env.submit.clicks,1);
});

test('SMV option sets may differ in order but must agree on every required index', () => {
    const component = clone(secureAnswerNext.nextQuestion.component);
    component._smvWiseScoring.outcomes.interpretvar[1].interpret =
        'Option 4, Option 1, and Option 3 are correct.1 point for each correct option.0 points if more options are selected than required.';
    const env = secureCheckboxQuestion(component);
    const plan = env.helper.choiceActions(component,env.scope,true);
    assert.equal(plan.supported,true);
    plan.actions.forEach(action => action.apply());
    assert.deepEqual(env.labels.map(label => label.control.checked),[true,false,true,true,false,false]);
});

test('multi-select scoring does not toggle mutually exclusive radio controls', () => {
    const env = secureCheckboxQuestion();
    env.labels.forEach(label => { label.control.type = 'radio'; });
    const plan = env.helper.choiceActions(env.component,env.scope,true);
    assert.equal(plan.supported,false);
    assert.equal(plan.actions.length,0);
    assert.match(plan.reason,/radio controls/);
});

test('multi-choice SMV rejects conflicting sets, duplicate indices, incorrect counts and unsupported scoring text', () => {
    const variants = [
        component => { component._selectable = 2; },
        component => { component._smvWiseScoring.outcomes.interpretvar[0].interpret = '1 point for Option 1, Option 1, Option 40 points for any other option'; },
        component => { component._smvWiseScoring.outcomes.interpretvar[1].interpret = 'Option 1, Option 3, and Option 5 are correct.1 point for each correct option.0 points if more options are selected than required.'; },
        component => { component._smvWiseScoring.outcomes.interpretvar[1].interpret = 'Option 1, Option 3, and Option 7 are correct.1 point for each correct option.0 points if more options are selected than required.'; },
        component => { component._smvWiseScoring.outcomes.interpretvar[1].interpret += ' Another rule applies.'; },
        component => { component._smvWiseScoring.outcomes.interpretvar[1].interpret = 'Option 1, Option 3, and Option 4 are correct.0 points for each correct option.0 points if more options are selected than required.'; }
    ];
    for (const change of variants) {
        const component = clone(secureAnswerNext.nextQuestion.component); change(component);
        const env = secureCheckboxQuestion(component), plan = env.helper.choiceActions(component,env.scope,true);
        assert.equal(plan.supported,false);
        assert.equal(plan.actions.length,0);
        assert.equal(env.submit.clicks,0);
    }
});

test('nested nextQuestion indices bind eligibility to Q10 and exclude an unrelated active question', async () => {
    const env = boot(JSON.stringify(secureAnswerNext),{headers:{'content-type':'application/json'}}), scope = node();
    const button = node('Q9'); button.className = 'block-button active-block';
    env.document.querySelector = () => scope;
    env.document.querySelectorAll = selector => selector === 'button.block-button' ? [button] : [];
    await env.window.fetch('https://ssac-backend.netacad.com/v3/answerQuestion/');
    assert.equal(env.helper.unfinishedActivities().length,0);
    button.textContent = 'Q10';
    assert.equal(env.helper.unfinishedActivities().length,1);
});

test('successive secure question responses on the same endpoint are captured independently', async () => {
    const responses = [secureQuestion,secureQuestionTwo];
    const env = boot('[]',{fetch:async () => new Response(JSON.stringify(responses.shift()),
        {status:201,headers:{'content-type':'application/json'}})});
    for (let i=0;i<2;i++) await env.window.fetch('https://ssac-backend.netacad.com/v3/getQuestionAt/');
    assert.deepEqual(clone(env.helper.components.get('secure-question-two')),secureQuestionTwo.component);
    assert.equal(env.helper.debugReport().assessment.responseCapture.questionRecords,2);
    assert.equal(env.requests(),2);
});

test('secure state responses containing supported question components are captured without assuming one operation name', async () => {
    const body = {state:{questions:[secureQuestion.component,secureQuestionTwo.component]}};
    const env = boot(JSON.stringify(body),{status:201,headers:{'content-type':'application/json'}});
    const response = await env.window.fetch('https://ssac-backend.netacad.com/v3/getCurrentState/');
    const received = await response.json();
    assert.match(received.state.questions[1]._items[3].text,/data-na-correct/);
    assert.deepEqual(clone(env.helper.components.get('secure-question-two')),secureQuestionTwo.component);
    assert.equal(env.requests(),1);
});

test('secure backend responses without component records remain unchanged', async () => {
    const body = {state:'ready',index:1};
    const env = boot(JSON.stringify(body),{headers:{'content-type':'application/json'}});
    assert.equal(await env.window.fetch('https://ssac-backend.netacad.com/v3/getCurrentState/'),env.original);
    assert.equal(env.original.bodyUsed,false);
    assert.equal(env.helper.components.size,0);
});

test('capture accepts URL-like inputs from other realms and uses native response URLs when available', async () => {
    const url = 'https://ssac-backend.netacad.com/v3/getQuestionAt/';
    const env = boot(JSON.stringify(secureQuestionTwo),{headers:{'content-type':'application/json'}});
    await env.window.fetch({href:url});
    assert.equal(env.helper.components.has('secure-question-two'),true);
    const response = new Response(JSON.stringify(secureQuestionTwo),{headers:{'content-type':'application/json'}});
    Object.defineProperty(response,'url',{value:url});
    const native = boot('[]',{fetch:async () => response});
    await native.window.fetch({});
    assert.equal(native.helper.components.has('secure-question-two'),true);
});

test('Auto submits Q1 then captures and submits Q2 while leaving the old rendered Q1 outside pending work', async () => {
    const responses = [secureQuestion,secureQuestionTwo];
    const env = boot('[]',{fetch:async () => new Response(JSON.stringify(responses.shift()),
        {status:201,headers:{'content-type':'application/json'}})});
    const buttons = [node('Q1'),node('Q2')], submit = node('Submit',{'aria-label':'submit'});
    const endpoint = 'https://ssac-backend.netacad.com/v3/getQuestionAt/';
    let stage = 0, nextResponse;
    const scopes = responses.map((response,index) => {
        const scope = node();
        scope.getBoundingClientRect = () => ({top:stage === index ? 10 : 2000,bottom:stage === index ? 100 : 2100,left:10,right:200});
        const labels = [...response.component._items].reverse().map(item => {
            const label = node(item.text);
            label.control = {type:'radio',checked:false,click() { this.checked = true; submit.disabled = false; }};
            return label;
        });
        scope.children.set(controlSelector,labels);
        return scope;
    });
    buttons[0].className = 'block-button active-block';
    env.document.querySelector = selector => selector.includes('secure-question-two') ? scopes[1] :
        selector.includes('secure-question') ? scopes[0] : null;
    env.document.querySelectorAll = selector => selector === 'button.block-button' ? buttons.slice(0,stage+1) :
        selector === 'button,[role="button"]' ? [submit] : [];
    submit.disabled = true;
    submit.click = () => {
        submit.clicks++; submit.disabled = true;
        if (stage === 0) {
            stage = 1; buttons[0].className = 'block-button'; buttons[1].className = 'block-button active-block';
            nextResponse = env.window.fetch(endpoint);
        } else scopes[1].matches = selector => selector === '.is-submitted';
    };
    env.helper.getPreferences().paced = false; env.helper.getPreferences().submit = true;
    await env.window.fetch(endpoint);
    await env.helper.runAutoOnce();
    assert.equal(submit.clicks,1);
    await nextResponse;
    await env.helper.runAutoOnce();
    assert.equal(submit.clicks,2);
    assert.equal(scopes[1].children.get(controlSelector).find(label => label.textContent === 'Dotted square').control.checked,true);
    assert.equal(env.helper.pendingQuestions.has('secure-question'),false);
    assert.equal(env.helper.unfinishedActivities().some(entry => entry.component._id === 'secure-question'),false);
    assert.equal(env.requests(),2);
});

test('secure question eligibility follows the active numbered button when reviewing earlier questions', async () => {
    const env = boot(JSON.stringify(secureQuestion),{headers:{'content-type':'application/json'}}), scope = node();
    const q1 = node('Q1'), q2 = node('Q2');
    q2.className = 'block-button active-block';
    env.document.querySelector = () => scope;
    env.document.querySelectorAll = selector => selector === 'button.block-button' ? [q1,q2] : [];
    await env.window.fetch('https://ssac-backend.netacad.com/v3/getQuestionAt/');
    assert.equal(env.helper.unfinishedActivities().length,0);
    q2.className = 'block-button'; q1.className = 'block-button active-block';
    assert.equal(env.helper.unfinishedActivities().length,1);
});

test('a late secure question response stays bound to the route that requested it', async () => {
    let release;
    const env = boot('[]',{fetch:() => new Promise(resolve => { release = resolve; })}), scope = node(), q1 = node('Q1');
    q1.className = 'block-button active-block';
    env.document.querySelector = () => scope;
    env.document.querySelectorAll = selector => selector === 'button.block-button' ? [q1] : [];
    const response = env.window.fetch('https://ssac-backend.netacad.com/v3/getQuestionAt/');
    env.location.href = 'https://www.netacad.com/other-course';
    release(new Response(JSON.stringify(secureQuestion),{headers:{'content-type':'application/json'}}));
    await response;
    assert.equal(env.helper.unfinishedActivities().length,0);
});

test('secure getQuestionAt response captures the schema and decorates its SMV choice without changing scoring fields', async () => {
    const env = boot(JSON.stringify(secureQuestion),{status:201,headers:{'content-type':'application/json; charset=utf-8'}});
    const response = await env.window.fetch('https://ssac-backend.netacad.com/v3/getQuestionAt/');
    const received = await response.json();
    assert.match(received.component._items[3].text,/data-na-correct/);
    received.component._items[3].text = 'Mock label four';
    assert.deepEqual(received,secureQuestion);
    assert.deepEqual(clone(env.helper.components.get('secure-question')),secureQuestion.component);
    assert.equal(response.status,201);
    assert.equal(env.requests(),1);
    assert.equal(env.original.bodyUsed,false);
});

test('Auto selects the SMV option by its text in shuffled native labels and submits once', async () => {
    const env = boot(JSON.stringify(secureQuestion),{status:201,headers:{'content-type':'application/json'}});
    const scope = node(), submit = node('Submit',{'aria-label':'submit'}), q1 = node('Q1');
    const labels = ['Mock label five','Mock label two','Mock label three','Mock label one','Mock label four'].map(text => {
        const label = node(text);
        label.control = {type:'radio',checked:false,click() {
            labels.forEach(other => { other.control.checked = false; });
            this.checked = true; submit.disabled = false;
        }};
        return label;
    });
    scope.children.set(controlSelector,labels);
    env.document.querySelector = () => scope;
    env.document.querySelectorAll = selector => selector === 'button.block-button' ? [q1] :
        selector === 'button,[role="button"]' ? [submit] : [];
    submit.disabled = true;
    submit.click = () => { submit.clicks++; scope.matches = selector => selector === '.is-submitted'; };
    env.helper.getPreferences().paced = false; env.helper.getPreferences().submit = true;
    await env.window.fetch('https://ssac-backend.netacad.com/v3/getQuestionAt/');
    await env.helper.runAutoOnce();
    assert.deepEqual(labels.map(label => label.control.checked),[false,false,false,false,true]);
    assert.equal(submit.clicks,1);
    const report = env.helper.debugReport();
    assert.equal(report.assessment.capturedQuestionSchemas,1);
    assert.equal(report.activities[0].choices.reason,null);
    assert.deepEqual(clone(env.helper.components.get('secure-question')),secureQuestion.component);
});

test('SMV fallback rejects conflicting, missing, unsupported and out-of-range interpretations', () => {
    const env = boot(), scope = node();
    scope.children.set(controlSelector,secureQuestion.component._items.map(item => node(item.text)));
    const variations = [
        component => { component._smvWiseScoring.outcomes.interpretvar[1].interpret = '2 points for Option 30 points for any other option'; },
        component => { component._smvWiseScoring.outcomes.interpretvar[0].interpret = '1 point for Option 60 points for any other option'; },
        component => { component._smvWiseScoring.outcomes.interpretvar[0].interpret = '0 points for Option 40 points for any other option'; },
        component => { component._smvWiseScoring.outcomes.interpretvar[0].interpret = '1 point for Option 4'; },
        component => { component._smvWiseScoring.outcomes.interpretvar[0].interpret += ' or Option 5'; },
        component => { component._smvWiseScoring.outcomes.interpretvar = []; },
        component => { delete component._smvWiseScoring; },
        component => { component._selectable = 2; },
        component => { component._items[0] = null; }
    ];
    for (const change of variations) {
        const component = clone(secureQuestion.component); change(component);
        const before = JSON.stringify(component), result = env.helper.choiceActions(component,scope,true);
        assert.equal(result.supported,false);
        assert.equal(result.actions.length,0);
        assert.equal(JSON.stringify(component),before);
    }
});

test('explicit native choice flags take precedence over SMV interpretation text', () => {
    const env = boot(), component = clone(secureQuestion.component), scope = node();
    component._items.forEach((item,index) => { item._shouldBeSelected = index === 0; });
    const labels = component._items.map(item => {
        const label = node(item.text); label.control = {type:'radio',checked:false}; return label;
    });
    scope.children.set(controlSelector,labels);
    const result = env.helper.choiceActions(component,scope,true);
    assert.equal(result.supported,true);
    assert.equal(result.actions[0].node,labels[0]);
});

test('SMV concatenated zero-score text supports an unambiguous two-digit option index', () => {
    const env = boot(), component = clone(secureQuestion.component), scope = node();
    component._items = Array.from({length:10},(_,i) => ({text:'Choice '+(i+1)}));
    component._smvWiseScoring.outcomes.interpretvar = [{interpret:'1 point for Option 100 points for any other option'}];
    const labels = component._items.map(item => {
        const label = node(item.text); label.control = {type:'radio',checked:false}; return label;
    });
    scope.children.set(controlSelector,labels);
    const result = env.helper.choiceActions(component,scope,true);
    assert.equal(result.supported,true);
    assert.equal(result.actions[0].node,labels[9]);
});

test('XHR observes the exact secure assessment endpoint without rewriting its response', () => {
    const env = boot('[]',{XMLHttpRequest:assessmentXHR()}), xhr = new env.window.XMLHttpRequest();
    xhr.open('POST','https://ssac-backend.netacad.com/v3/getQuestionAt/'); xhr.send(); xhr.status = 201;
    xhr.load(clone(secureQuestion));
    assert.deepEqual(clone(env.helper.components.get('secure-question')),secureQuestion.component);
    assert.deepEqual(JSON.parse(xhr.responseText),secureQuestion);
    assert.equal(xhr.sends,1);
});

test('secure question capture does not broaden to unrelated hosts, protocols or API versions', async () => {
    for (const url of ['https://example.com/v3/getQuestionAt/','http://ssac-backend.netacad.com/v3/getQuestionAt/',
        'https://ssac-backend.netacad.com.example.com/v3/getQuestionAt/','https://ssac-backend.netacad.com/v2/getQuestionAt/']) {
        const env = boot(JSON.stringify(secureQuestion),{headers:{'content-type':'application/json'}});
        assert.equal(await env.window.fetch(url),env.original);
        assert.equal(env.helper.components.size,0);
    }
});

function missingOutlineLesson() {
    const env = boot(), next = node('',{'aria-label':'Go To 9.2. Sample Topic Two'}), tree = node();
    next.className = 'moduleNavBtn--sFwjV next--3dfUb';
    const current = node('9.1. Sample Topic One1 / 2'), target = node('9.2. Sample Topic Two0 / 3');
    const group = node('9.1.2 Sample Lesson4 / 5'), leaf = node('9.1.2.1 Sample Lesson');
    for (const entry of [current,target,group,leaf]) entry.parentElement = entry.parentNode = tree;
    leaf.closest = selector => selector.startsWith('button,a[href]') ? leaf : null;
    tree.children.set('*',[group,leaf]);
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="submodule-button-"]' ? [current,target] : [];
    env.helper.getPreferences().paced = false;
    return {...env,next,current,target,tree,group,leaf};
}

test('missing rendered widgets recover through the incomplete 9.1.2 outline group once per progress state', async () => {
    const env = missingOutlineLesson();
    assert.equal(env.helper.unfinishedActivities().length,0);
    assert.equal(env.helper.debugReport().navigation.outlineRecovery.target,'9.1.2.1 Sample Lesson');
    await env.helper.runAutoOnce();
    assert.equal(env.leaf.clicks,1);
    assert.equal(env.next.clicks,0);
    await env.helper.runAutoOnce();
    assert.equal(env.leaf.clicks,1);
    assert.equal(env.helper.debugReport().navigation.outlineRecovery.attempted,true);
});

test('outline recovery waits for real completion instead of treating an earlier visit as complete', async () => {
    const env = missingOutlineLesson();
    await env.helper.runAutoOnce();
    assert.equal(env.helper.debugReport().pageComplete,false);
    env.current.textContent = '9.1. Sample Topic One2 / 2';
    assert.equal(env.helper.debugReport().navigation.outlineRecovery,null);
    assert.equal(reportedNext(env),env.next.getAttribute('aria-label') || env.next.textContent);
});

test('outline recovery refuses a broad ancestor that would collapse a lesson group', () => {
    const env = missingOutlineLesson();
    env.leaf.closest = selector => selector.startsWith('button,a[href]') ? env.group : null;
    assert.equal(env.helper.debugReport().navigation.outlineRecovery.target,undefined);
});

test('browser long-task capture is bounded, marks overlapping helper reads, and disconnects', () => {
    let observer, clock = 0;
    class Observer {
        constructor(callback) { this.callback = callback; observer = this; }
        observe(options) { this.options = options; }
        disconnect() { this.disconnected = true; }
    }
    const env = boot('[]',{performance:{now:() => clock},PerformanceObserver:Observer,
        setTimeout:() => 1,clearTimeout:() => {}});
    env.helper.startPerformanceCapture();
    env.helper.withDOMReads(() => { clock = 80; },'Known helper phase');
    observer.callback({getEntries:() => Array.from({length:100},() => ({startTime:0,duration:120}))});
    const report = env.helper.performanceReport();
    assert.equal(report.capture.longTasks.length,30);
    assert.equal(report.capture.longTasks[0].overlappingHelperReads[0],'Known helper phase');
    env.helper.stopPerformanceCapture();
    assert.equal(observer.disconnected,true);
});

test('Performance report is a bounded snapshot and never scans the DOM', () => {
    const env = boot();
    for (let i=0;i<100;i++) env.helper.withDOMReads(() => {},'sample-'+i);
    env.document.querySelectorAll = () => { throw Error('report must not query DOM'); };
    const report = env.helper.performanceReport();
    assert.equal(report.recent.length,30);
    assert.equal(report.recent[0].operation,'sample-70');
    assert.equal(report.readPerformance.passes,100);
});

test('an over-budget Auto read cancels further actions and suspends refresh scheduling', async () => {
    let clock = 0;
    const env = boot('[]',{performance:{now:() => clock}});
    env.document.querySelectorAll = () => { clock += 300; return []; };
    await env.helper.runAutoOnce();
    const report = env.helper.performanceReport();
    assert.equal(report.automatic,false);
    assert.equal(report.refreshSuspended,true);
    assert.ok(report.pause.milliseconds >= 300);
    assert.equal(report.slowReads.length,1);
    env.helper.scheduleRefresh();
    assert.equal(env.helper.performanceReport().counters.refreshRequests,1);
});

test('60 second recording tracks foreground event-loop delay and releases all timers', () => {
    let clock = 0, nextId = 0;
    const timers = new Map();
    const env = boot('[]',{performance:{now:() => clock},
        setTimeout:(callback,delay) => { timers.set(++nextId,{callback,delay}); return nextId; },
        clearTimeout:id => timers.delete(id)});
    env.helper.startPerformanceCapture();
    assert.equal(env.helper.performanceReport().capture.longTaskSupport,false);
    const pulse = [...timers.values()].find(timer => timer.delay === 1000);
    clock = 1800; pulse.callback();
    assert.equal(env.helper.performanceReport().capture.eventLoopDelays[0].milliseconds,800);
    env.helper.stopPerformanceCapture();
    assert.ok(env.helper.performanceReport().capture.endedAt);
    // Simulated fired timeout remains in this fake scheduler; all pending
    // recording timers (new pulse and stop timer) have been cleared.
    assert.equal([...timers.values()].filter(timer => timer !== pulse).length,0);
});

test('completed Module 8 advances to the immediately following checkpoint for Modules 7-8', async () => {
    const env = boot(), next = node('',{'aria-label':'Go To Checkpoint Exam'});
    env.location.href = 'https://www.netacad.com/authoring-resources/index.html?moduleNumber=8#/courses/example';
    next.className = 'moduleNavBtn--sFwjV next--3dfUb';
    let module = node('Module 8: Sample Devices100%');
    let checkpoint = node('Checkpoint Exam Modules 7–8');
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="node-button-"]' ? [node('Checkpoint Exam Modules 5-6100%'),module,checkpoint,node('Module 9: Sample Topic One')] : [];
    env.helper.getPreferences().paced = false;
    assert.equal(reportedNext(env),next.getAttribute('aria-label') || next.textContent);
    await env.helper.runAutoOnce();
    assert.equal(next.clicks,1);
    module = node('Module 8: Sample Devices90%');
    assert.equal(reportedNext(env),null);
    module = node('Module 8: Sample Devices100%'); checkpoint = node('Checkpoint Exam Modules 10-11');
    assert.equal(reportedNext(env),null);
});

test('candidate-root routing preserves label-prefix widget lookup in nested shadow roots', () => {
    const env = boot(), scope = node(), label = node('',{});
    label.tagName = 'LABEL'; label.id = 'question-id-42-option-label';
    label.closest = selector => selector === '[data-na-answers]' ? null : scope;
    const empty = {nodeType:11,querySelectorAll:() => []};
    const root = {nodeType:11,querySelectorAll:selector => selector === '*' ? [label] : []};
    const component = {_id:'question-id-42',_component:'mcq'};
    assert.equal(env.helper.withDOMReads(() => env.helper.scopeFor(component,[empty,root])),scope);
});

test('completed 8.2 advances past seven decorative dynamic graphics without recovering them', async () => {
    const env = boot(), next = node('',{'aria-label':'Go To 8.3. Sample Follow-Up Activity'});
    next.className = 'moduleNavBtn--sFwjV next--3dfUb';
    const assets = Array.from({length:7},(_,i) => {
        const asset = node(); asset.getBoundingClientRect = () => ({top:1200,bottom:1300,left:10,right:100});
        asset.scrollIntoView = () => { throw Error('decorative asset must not trigger recovery'); };
        env.helper.components.set('asset-'+i,{_id:'asset-'+i,_component:'dynamic-graphic'});
        return asset;
    });
    env.document.querySelector = selector => assets.find((_,i) => selector.includes('"asset-'+i+'"')) || null;
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="submodule-button-"]' ? [node('8.2. Sample Activity Eight6 / 6'),node('8.3. Sample Follow-Up Activity0 / 3')] : [];
    assert.equal(env.helper.unfinishedActivities().length,0);
    assert.equal(env.helper.recoverIncompleteActivity(),false);
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(next.clicks,1);
});

test('excluding decorative graphics preserves the owning graphic completion requirement', () => {
    const env = boot(), scope = node();
    env.document.querySelector = () => scope;
    env.helper.components.set('owner',{_id:'owner',_component:'graphic'});
    env.helper.components.set('asset',{_id:'asset',_component:'dynamic-graphic'});
    assert.equal(env.helper.unfinishedActivities().length,1);
    assert.equal(env.helper.unfinishedActivities()[0].component._id,'owner');
});

test('debug identifies its live page and distinguishes unfinished blockers from Next resolution', async () => {
    const env = setupNavigation(true);
    env.helper.pendingQuestions.add('pending');
    await env.helper.continueCourse(false,null,0,'current');
    const report = env.helper.debugReport();
    assert.equal(report.url,env.location.href);
    assert.ok(Number.isFinite(Date.parse(report.generatedAt)));
    assert.match(report.navigation.lastDecision.reason,/Unfinished questions/);
    assert.equal(report.navigation.resolvedNext.text,'Next module');
});

test('empty shadow-root scope indexes prevent per-schema selector fallback', () => {
    const {helper} = boot();
    let queries = 0;
    const roots = Array.from({length:200},() => ({nodeType:11,
        querySelectorAll:() => { queries++; return []; },
        querySelector:() => { queries++; return null; }}));
    helper.withDOMReads(() => {
        for (let i=0;i<500;i++) helper.scopeFor({_id:'old-'+i,_component:'text'},roots,false);
    });
    assert.equal(queries,200); // One discovery walk per root, no selector fallback.
});

test('Auto follows the cross-module Introduction arrow when the previous module is 100%', async () => {
    const env = boot(), next = node('',{'aria-label':'Go To 8.0. Introduction'});
    next.className = 'moduleNavBtn--sFwjV next--3dfUb';
    let module = node('Module 7: Sample Topic Seven100%');
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="node-button-"]' ? [node('Module 6: Sample Topic Six100%'),module,node('Module 8: Sample Devices')] : [];
    env.helper.getPreferences().paced = false;
    assert.equal(reportedNext(env),next.getAttribute('aria-label') || next.textContent);
    await env.helper.runAutoOnce();
    assert.equal(next.clicks,1);
    module = node('Module 7: Sample Topic Seven90%');
    assert.equal(reportedNext(env),null);
});

function assessmentReview() {
    const env = boot(), container = node(), submit = node('Submit'), confirmation = node();
    const label = node('Yes, confirm my submission.');
    const strip = Array.from({length:15},(_,i) => node('Q'+(i+1),{'aria-label':'answered Question '+(i+1)}));
    confirmation.labels = [label]; confirmation.checked = false;
    confirmation.click = () => { confirmation.clicks++; confirmation.checked = true; };
    submit.parentElement = container; confirmation.parentElement = container;
    submit.classList.contains = () => !confirmation.checked;
    container.children.set('.adaptive-assessment-submit',[submit]);
    container.children.set('input[type=checkbox],[role=checkbox]',[confirmation]);
    env.document.querySelectorAll = selector => selector === '.adaptive-assessment-submit' ? [submit] :
        selector === 'button.block-button[aria-label]' ? strip : [];
    env.helper.getPreferences().paced = false;
    env.helper.getPreferences().submit = true;
    return {...env,container,submit,confirmation,strip};
}

test('final assessment confirmation precedes stale recovery and submits once after rechecking enabled state', async () => {
    const env = assessmentReview();
    env.helper.pendingQuestions.add('old-question');
    await env.helper.runAutoOnce();
    assert.equal(env.confirmation.clicks,1);
    assert.equal(env.submit.clicks,0);
    await env.helper.runAutoOnce();
    assert.equal(env.submit.clicks,1);
    await env.helper.runAutoOnce();
    assert.equal(env.submit.clicks,1);
    assert.equal(env.confirmation.clicks,1);
});

test('final assessment submission requires every numbered question answered and submit preference', () => {
    const env = assessmentReview();
    env.strip[5].setAttribute('aria-label','unanswered Question 6');
    assert.equal(env.helper.assessmentSubmissionPlan().supported,false);
    env.strip[5].setAttribute('aria-label','answered Question 6');
    env.helper.getPreferences().submit = false;
    assert.equal(env.helper.assessmentSubmissionPlan().supported,false);
    assert.equal(env.confirmation.clicks+env.submit.clicks,0);
});

function secureSubmissionReview() {
    const env = assessmentReview(), review = node('Submit Page');
    env.strip.splice(0,env.strip.length,...Array.from({length:60},(_,i) => node('Q'+(i+1))));
    for (const button of env.strip.slice(0,15)) button.getBoundingClientRect = () => ({top:-100,bottom:-70,left:10,right:100});
    const reviews = [review], query = env.document.querySelectorAll;
    env.document.querySelectorAll = selector => selector === 'button.block-button[aria-label]' ? [] :
        selector === 'button.block-button' ? env.strip :
        selector === 'button.review-screen-button.active-block' ? reviews : query(selector);
    return {...env,review,reviews};
}

test('native Submit Page with 60 unlabeled questions confirms then submits once, including offscreen strip entries', async () => {
    const env = secureSubmissionReview();
    env.helper.pendingQuestions.add('stale-last-question');
    await env.helper.runAutoOnce();
    assert.equal(env.confirmation.clicks,1);
    assert.equal(env.submit.clicks,0);
    await env.helper.runAutoOnce();
    await env.helper.runAutoOnce();
    assert.equal(env.submit.clicks,1);
    assert.equal(env.confirmation.clicks,1);
});

test('native Submit Page waits for enabled Submit after confirming and honors the submit preference', async () => {
    const env = secureSubmissionReview();
    env.helper.getPreferences().submit = false;
    await env.helper.runAutoOnce();
    assert.equal(env.confirmation.clicks,0);
    env.helper.getPreferences().submit = true;
    env.submit.classList.contains = () => true;
    await env.helper.runAutoOnce();
    await env.helper.runAutoOnce();
    assert.equal(env.confirmation.clicks,1);
    assert.equal(env.submit.clicks,0);
    env.submit.classList.contains = () => false;
    await env.helper.runAutoOnce();
    assert.equal(env.submit.clicks,1);
});

test('native review fallback refuses missing, duplicate, and partial question strips or ambiguous review pages', () => {
    const changes = [
        env => { env.strip.length = 0; },
        env => { env.strip.shift(); },
        env => { env.strip[9].textContent = 'Q9'; },
        env => { env.reviews.length = 0; },
        env => { env.reviews.push(node('Submit Page')); },
        env => { env.review.textContent = 'Result Page'; },
        env => { env.strip[0].className = 'block-button active-block'; },
        env => { env.strip[0].setAttribute('aria-label','unanswered Question 1'); }
    ];
    for (const change of changes) {
        const env = secureSubmissionReview(); change(env);
        assert.equal(env.helper.assessmentSubmissionPlan().supported,false);
        assert.equal(env.confirmation.clicks+env.submit.clicks,0);
    }
});

test('native review confirmation stays bound to one uniquely labeled checkbox', () => {
    const env = secureSubmissionReview();
    env.container.children.set('input[type=checkbox],[role=checkbox]',[env.confirmation,env.confirmation]);
    assert.equal(env.helper.assessmentSubmissionPlan().supported,false);
    env.container.children.set('input[type=checkbox],[role=checkbox]',[env.confirmation]);
    env.confirmation.labels = [node('Something else')];
    assert.equal(env.helper.assessmentSubmissionPlan().supported,false);
});

test('native review with an already checked confirmation submits without toggling it off', async () => {
    const env = secureSubmissionReview();
    env.confirmation.checked = true;
    await env.helper.runAutoOnce();
    assert.equal(env.confirmation.clicks,0);
    assert.equal(env.submit.clicks,1);
});

test('native assessment confirmation is cancelled if the route changes during its delay', async () => {
    const env = secureSubmissionReview();
    const running = env.helper.runAutoOnce();
    setTimeout(() => { env.location.href = 'https://www.netacad.com/another-course'; },25);
    await running;
    assert.equal(env.confirmation.clicks+env.submit.clicks,0);
});

test('adaptive Start screen stops blocking recovery once the actual quiz question strip appears', () => {
    const env = assessmentReview();
    assert.equal(env.helper.activityFinished({_component:'adaptiveStartScreen'},node()),true);
});

test('unlabeled Q1 retires the hidden assessment intro without qualifying for final submission', async () => {
    const env = boot(), intro = node(), q1 = node('Q1');
    let scrolls = 0;
    intro.getBoundingClientRect = () => ({top:2000,bottom:2040,left:10,right:200});
    intro.scrollIntoView = () => { scrolls++; };
    env.document.querySelector = () => intro;
    env.document.querySelectorAll = selector => selector === 'button.block-button' ? [q1] : [];
    env.helper.components.set('intro',{_id:'intro',_component:'adaptiveStartScreen'});
    assert.equal(env.helper.activityFinished({_component:'adaptiveStartScreen'},intro),true);
    assert.equal(env.helper.unfinishedActivities().length,0);
    await env.helper.runAutoOnce();
    assert.equal(scrolls,0);
    const report = env.helper.debugReport();
    assert.equal(report.activeActivity.phase,'missing schema');
    assert.equal(report.assessment.questionButtons.length,1);
    assert.equal(report.assessment.capturedQuestionSchemas,0);
    assert.equal(report.pageComplete,false);
});

test('unlabeled question buttons cannot authorize final assessment submission', () => {
    const env = assessmentReview(), query = env.document.querySelectorAll;
    env.document.querySelectorAll = selector => selector === 'button.block-button[aria-label]' ? [] :
        selector === 'button.block-button' ? [node('Q1')] : query(selector);
    assert.equal(env.helper.assessmentSubmissionPlan().supported,false);
    assert.equal(env.confirmation.clicks+env.submit.clicks,0);
});

test('a pending assessment Start does not click after an unlabeled question appears', () => {
    const env = boot(), scope = node(), start = node('Start');
    env.helper.getPreferences().submit = true;
    scope.children.set(controlSelector,[start]);
    const action = env.helper.plan({_component:'adaptiveStartScreen'},scope,true).actions[0];
    env.document.querySelectorAll = selector => selector === 'button.block-button' ? [node('Q1')] : [];
    action.apply();
    assert.equal(start.clicks,0);
});

test('assessment confirmation refuses duplicate checkboxes and stays pending while Submit is disabled', () => {
    const env = assessmentReview();
    env.confirmation.checked = true;
    env.submit.classList.contains = () => true;
    assert.equal(env.helper.assessmentSubmissionPlan().supported,false);
    env.container.children.set('input[type=checkbox],[role=checkbox]',[env.confirmation,env.confirmation]);
    assert.match(env.helper.assessmentSubmissionPlan().reason,/one assessment submission confirmation/);
});

test('assessment stage is revalidated after delay when its Submit control disappears', async () => {
    const env = assessmentReview(), query = env.document.querySelectorAll;
    const running = env.helper.runAutoOnce();
    setTimeout(() => { env.document.querySelectorAll = selector => selector === '.adaptive-assessment-submit' ? [] : query(selector); },25);
    await running;
    assert.equal(env.confirmation.clicks+env.submit.clicks,0);
});

test('visibility layout reads are shared only within a synchronous scan', () => {
    const {helper} = boot(), target = node(); let rects = 0;
    target.getClientRects = () => { rects++; return [{}]; };
    helper.withDOMReads(() => { helper.available(target); helper.available(target); helper.enabledRendered(target); });
    assert.equal(rects,1);
    helper.available(target);
    assert.equal(rects,2);
});

test('a large retained question bank shares DOM discovery and text reads within one pass', () => {
    const result = require('./performance.cjs').measure(source);
    assert.equal(result.queries,2);
    assert.equal(result.clones,0);
});

test('DOM read caches expire between plans, including after an exception', () => {
    const {helper} = boot(), scope = node();
    let children = [node('first')], queries = 0;
    scope.querySelectorAll = selector => { queries++; return selector === 'button' ? children : []; };
    helper.withDOMReads(() => {
        assert.equal(helper.all(scope,'button')[0].textContent,'first');
        helper.all(scope,'button');
        assert.equal(queries,2); // One shadow-root walk and one button query.
    });
    children = [node('replacement')];
    assert.throws(() => helper.withDOMReads(() => { helper.all(scope,'button'); throw Error('changed'); }));
    children = [node('after exception')];
    assert.equal(helper.withDOMReads(() => helper.all(scope,'button')[0].textContent),'after exception');
});

test('player and helper-preview mutations do not request full course refreshes', () => {
    const {helper} = boot(), player = node(), preview = node(), course = node();
    for (const target of [player,preview,course]) target.nodeType = 1;
    player.closest = () => player; preview.closest = () => preview;
    assert.equal(helper.courseMutations([{target:player},{target:preview}]),false);
    assert.equal(helper.courseMutations([{target:player},{target:course}]),true);
});

test('hidden Auto does not walk or clone the course DOM', async () => {
    const env = boot(); env.document.visibilityState = 'hidden';
    let scans = 0;
    env.document.querySelectorAll = () => { scans++; return []; };
    await env.helper.runAutoOnce();
    assert.equal(scans,0);
});

test('scope indexes are rebuilt when a course replaces its component element', () => {
    const env = boot(), first = node('',{class:'component lesson'}), replacement = node('',{class:'component lesson'});
    let current = first;
    env.document.querySelectorAll = selector => selector === '*' ? [current] : [];
    const component = {_id:'lesson',_component:'narrative'};
    assert.equal(env.helper.withDOMReads(() => env.helper.scopeFor(component,[env.document])),first);
    current = replacement;
    assert.equal(env.helper.withDOMReads(() => env.helper.scopeFor(component,[env.document])),replacement);
});

test('debug reports bounded synchronous scan measurements', () => {
    const {helper} = boot(), scope = node();
    helper.withDOMReads(() => { helper.all(scope,'button'); helper.labelText(scope); });
    const stats = helper.debugReport().readPerformance;
    assert.equal(stats.passes,1);
    assert.equal(stats.last.queries,2);
    assert.equal(stats.last.textClones,0);
    assert.ok(stats.last.milliseconds >= 0);
});

test('Auto starts an already-complete adaptive intro with an unlabeled role button once', async () => {
    const env = boot(), scope = node(), start = node('Start', {role:'button'});
    scope.matches = selector => selector.startsWith('.is-complete');
    scope.children.set(controlSelector,[start]);
    env.document.querySelector = () => scope;
    env.helper.components.set('intro',{_id:'intro',_component:'adaptiveStartScreen'});
    env.helper.getPreferences().paced = false;
    env.helper.getPreferences().submit = true;
    assert.equal(env.helper.unfinishedActivities().length,1);
    await env.helper.runAutoOnce();
    assert.equal(start.clicks,1);
    await env.helper.runAutoOnce();
    assert.equal(start.clicks,1);
    assert.equal(env.helper.debugReport().activeActivity.phase,'waiting');
});

test('assessment Start requires submit preference and rejects ambiguous controls', () => {
    const {helper} = boot(), scope = node(), start = node('Start');
    const component = {_component:'adaptiveStartScreen'};
    scope.children.set(controlSelector,[start]);
    assert.equal(helper.plan(component,scope,true).actions.length,0);
    helper.getPreferences().submit = true;
    scope.children.set(controlSelector,[start,node('Start')]);
    assert.equal(helper.plan(component,scope,true).supported,false);
});

test('course asset matching is independent of the authoring document base URL', () => {
    const env = boot(), image = node();
    const course = 'https://www.netacad.com/authoring-resources/courses/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/';
    const asset = 'en-US/assets/synthetic-asset-a.png';
    image.src = course+asset;
    const item = {_graphic:{src:asset,alt:''}};
    for (const base of [course,course+'en-US/',course+'course/index.html']) {
        env.document.baseURI = base;
        assert.equal(env.helper.imageMatchesItem(image,item),true,'base: '+base);
    }
    image.src = course+'en-US/assets/different.png';
    assert.equal(env.helper.imageMatchesItem(image,item),false);
});

test('graphic guides reuse the rendered course image as a thumbnail instead of showing a filename', () => {
    const env = boot(), scope = node(), guideRow = node(), label = node('Image 1'), image = node();
    const source = 'https://www.netacad.com/authoring-resources/courses/example/en-US/assets/abc123.png';
    env.document.baseURI = 'https://www.netacad.com/authoring-resources/courses/example/en-US/';
    image.src = source;
    const component = {_id:'graphic',_component:'matchingGraphic',_items:[{
        _graphic:{src:'en-US/assets/abc123.png',alt:''},_options:[{text:'Amber token',_isCorrect:true}]
    }]};
    const templateCreator = env.document.createElement;
    env.document.createElement = tag => tag === 'img' ? node() : templateCreator(tag);
    let previews = 0, preview;
    label.prepend = img => { previews++; preview = img; guideRow.children.set('.na-graphic-preview',[img]); };
    guideRow.children.set('span',[label]);
    scope.children.set('img',[image]);
    scope.children.set('[data-na-pair-index="0"]',[guideRow]);
    env.document.querySelector = () => scope;
    env.helper.components.set('graphic',component);
    env.helper.refreshGraphicGuides(); env.helper.refreshGraphicGuides();
    assert.equal(previews,1);
    assert.equal(preview.src,source);
    assert.equal(preview.alt,'Image 1');
    env.helper.decorate(component);
    assert.match(component.body,/Image 1/);
    assert.ok(!component.body.includes('abc123.png'));
});

test('reported image asset paths pair with dropdowns in separate grid containers', () => {
    const env = boot(), {helper} = env, scope = node(), grid = node();
    env.document.baseURI = 'https://www.netacad.com/authoring-resources/courses/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/en-US/';
    const selector = '[role=combobox],[aria-haspopup=listbox],button.js-dropdown-btn';
    const assets = ['synthetic-asset-a','synthetic-asset-b','synthetic-asset-c','synthetic-asset-d'];
    const answers = ['Amber token','Blue token','Coral token','Dotted token'];
    const cards = assets.map((asset,index) => {
        const img = node(), combo = node('Please select an option'), row = node(), option = node(answers[index]);
        const left = index%2 === 0 ? 440.5 : 960.5;
        const top = index < 2 ? 470.25 : 990.75;
        img.src = 'https://www.netacad.com/authoring-resources/courses/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/en-US/assets/'+asset+'.png';
        img.getBoundingClientRect = () => ({top,bottom:top+390.5,left,right:left+496});
        combo.getBoundingClientRect = () => ({top:top+410.5,bottom:top+480.75,left,right:left+496});
        combo.parentElement = row; row.parentElement = grid; grid.parentElement = scope;
        combo.matches = value => value === 'button.js-dropdown-btn';
        combo.scrollIntoView = () => {};
        row.children.set(selector,[combo]);
        row.children.set('[role=option],button,li,.dropdown__item,.dropdown__option',[combo,option]);
        option.click = () => { option.clicks++; combo.textContent = answers[index]; };
        return {img,combo,row,option,item:{_graphic:{alt:'',src:'en-US/assets/'+asset+'.png'},_options:[{text:answers[index],_isCorrect:true}]}};
    });
    scope.children.set('img',cards.map(card => card.img));
    // Different DOM and data ordering, plus no ancestor containing just one
    // dropdown and its image: this reproduces the failed structural lookup.
    const controls = cards.map(card => card.combo).reverse();
    scope.children.set(selector,controls); grid.children.set(selector,controls);
    const component = {_id:'graphic',_component:'matchingGraphic',_items:cards.map(card => card.item)};
    const bindings = helper.graphicBindings(component,scope,selector);
    assert.equal(bindings.length,4);
    cards.forEach((card,index) => assert.equal(bindings[index].control,card.combo));
    const result = helper.plan(component,scope,true);
    assert.equal(result.supported,true);
    assert.equal(result.actions[0].node,cards[0].combo);
    result.actions[0].apply();
    const choose = helper.plan(component,scope,true);
    assert.equal(choose.actions[0].node,cards[0].option);
    choose.actions[0].apply();
    assert.equal(cards[0].option.clicks,1);
    // Ambiguous geometry must not silently choose a column.
    cards[1].combo.getBoundingClientRect = cards[0].combo.getBoundingClientRect;
    assert.equal(helper.graphicBindings(component,scope,selector).length,0);
});

test('graphic matching binds shuffled custom dropdowns to image sources, never screen order', () => {
    const env = boot(), scope = node(), selector = '[role=combobox],[aria-haspopup=listbox],button.js-dropdown-btn';
    const cards = ['Amber token','Blue token','Coral token','Dotted token'].map((answer,index) => {
        const row = node(), combo = node('Please select an option'), img = node('');
        const option = node(answer);
        img.src = 'https://cdn.example.test/en-US/assets/card-'+index+'.png?size=large';
        row.parentElement = scope; combo.parentElement = row;
        combo.matches = selector => selector === 'button.js-dropdown-btn';
        row.children.set(selector,[combo]); row.children.set('img',[img]);
        row.children.set('[role=option],button,li,.dropdown__item,.dropdown__option',[combo,option]);
        option.click = () => { option.clicks++; combo.textContent = answer; };
        return {row,combo,option,item:{_graphic:{src:'en-US/assets/card-'+index+'.png',alt:'Card '+index},_options:[{text:answer,_isCorrect:true}]}};
    });
    scope.children.set(selector,[cards[3].combo,cards[1].combo,cards[0].combo,cards[2].combo]);
    const component = {_id:'graphic-question',_component:'matchingGraphic',_items:cards.map(card => card.item)};
    for (const card of cards) {
        let plan = env.helper.plan(component,scope,true);
        assert.equal(plan.supported,true);
        assert.equal(plan.actions[0].node,card.combo);
        plan.actions[0].apply();
        plan = env.helper.plan(component,scope,true);
        assert.equal(plan.actions[0].node,card.option);
        plan.actions[0].apply();
        assert.equal(card.option.clicks,1);
    }
    assert.equal(env.helper.plan(component,scope,true).actions.length,0);
    assert.equal(env.helper.decorate(component),true);
    assert.match(component.body,/Card 0/);
});

test('graphic matching refuses to guess when two dropdown rows use the same image', () => {
    const {helper} = boot(), scope = node(), selector = '[role=combobox],[aria-haspopup=listbox],button.js-dropdown-btn';
    const combos = [node('Choose'),node('Choose')];
    for (const combo of combos) {
        const row = node(), img = node(); img.src = 'https://www.netacad.com/image.png';
        combo.parentElement = row; row.parentElement = scope;
        row.children.set(selector,[combo]); row.children.set('img',[img]);
    }
    scope.children.set(selector,combos);
    const component = {_component:'matchingGraphic',_items:[{_graphic:{src:'image.png'},_options:[{text:'Answer',_isCorrect:true}]}]};
    const result = helper.plan(component,scope,true);
    assert.equal(result.supported,false);
    assert.equal(result.actions.length,0);
    assert.equal(combos[0].clicks+combos[1].clicks,0);
});

test('Auto fills and submits a graphic matching question through its native dropdown', async () => {
    const env = boot(), scope = node(), row = node(), img = node(), select = node(), submit = node('Submit');
    img.src = 'https://www.netacad.com/en-US/assets/usb.png';
    select.parentElement = row; row.parentElement = scope;
    select.value = ''; select.options = [{textContent:'Choose',value:''},{textContent:'Dotted token',value:'usb'}];
    select.scrollIntoView = () => {};
    scope.children.set('select',[select]); row.children.set('select',[select]); row.children.set('img',[img]);
    scope.children.set('.js-btn-submit,button[type=submit],[data-action=submit]',[submit]);
    submit.click = () => { submit.clicks++; scope.matches = selector => selector.startsWith('.is-complete'); };
    env.document.querySelector = () => scope;
    env.helper.components.set('graphic',{_id:'graphic',_component:'matchingGraphic',_items:[{
        _graphic:{src:'en-US/assets/usb.png'},_options:[{text:'Dotted token',_isCorrect:true}]
    }]});
    env.helper.getPreferences().paced = false; env.helper.getPreferences().submit = true;
    await env.helper.runAutoOnce();
    assert.equal(select.value,'usb');
    assert.equal(submit.clicks,1);
    assert.equal(env.helper.isComplete(scope),true);
});

test('an unknown visible question is reported as unsupported instead of silently ignored', async () => {
    const env = boot(), scope = node();
    scope.matches = selector => selector === '.is-question';
    env.document.querySelector = () => scope;
    env.helper.components.set('new-question',{_id:'new-question',_component:'newWidget'});
    await env.helper.runAutoOnce();
    assert.equal(env.helper.debugReport().activeActivity.phase,'unsupported question');
});

test('Auto handles the visible expansion-card narrative before a later offscreen question', async () => {
    const env = boot(), narrative = node(), later = node(), first = node(''), second = node('');
    let jumped = false;
    const selector = '[role=tab],.narrative__progress button';
    first.classList.contains = name => name === 'is-visited' || name === 'is-selected';
    second.setAttribute('aria-label','Slide 2 of 2');
    second.scrollIntoView = () => {};
    second.click = () => { second.clicks++; second.classList.contains = name => name === 'is-visited'; };
    narrative.children.set(selector,[first,second]);
    narrative.children.set(controlSelector,[first,second]);
    later.getBoundingClientRect = () => ({top:2000,bottom:2600,left:0,right:200});
    later.scrollIntoView = () => { jumped = true; };
    // Fetch order deliberately differs from the on-screen order.
    env.helper.components.set('later-question',{_id:'later-question',_component:'matching'});
    env.helper.components.set('current-narrative',{_id:'current-narrative',_component:'narrative',_setCompletionOn:'allItems'});
    env.document.querySelector = selector => selector.includes('current-narrative') ? narrative : later;
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(second.clicks,1);
    assert.equal(jumped,false);
    assert.equal(env.helper.pendingCount(),1);
    assert.equal(env.helper.debugReport().activeActivity.id,'current-narrative');
});

test('Auto rechecks widgets on the next tick instead of using a plan for a second widget', async () => {
    const env = boot(), a = node(), b = node(), aTab = node('A'), bTab = node('B');
    aTab.scrollIntoView = bTab.scrollIntoView = () => {};
    a.children.set('[role=tab]',[aTab]); a.children.set(controlSelector,[aTab]);
    b.children.set('[role=tab]',[bTab]); b.children.set(controlSelector,[bTab]);
    env.helper.components.set('a',{_id:'a',_component:'tabs'});
    env.helper.components.set('b',{_id:'b',_component:'tabs'});
    env.document.querySelector = selector => selector.includes('"a"') ? a : b;
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(aTab.clicks,1);
    assert.equal(bTab.clicks,0);
});

test('narrative clicks that do not register are not mistaken for visited slides', () => {
    const {helper} = boot(), scope = node(), tab = node('');
    scope.children.set('[role=tab],.narrative__progress button',[tab]);
    const component = {_component:'narrative'};
    helper.plan(component,scope,true).actions[0].apply();
    assert.equal(helper.plan(component,scope,true).actions[0].node,tab);
    tab.classList.contains = name => name === 'is-visited';
    const waiting = helper.plan(component,scope,true);
    assert.equal(waiting.actions.length,0);
    assert.equal(waiting.waiting,true);
});

test('an unfinished narrative blocks course Next even when the shell reports complete', async () => {
    const env = setupNavigation(true), narrative = node();
    env.helper.components.set('unfinished-narrative',{_id:'unfinished-narrative',_component:'narrative'});
    env.document.querySelector = () => narrative;
    env.helper.getPreferences().paced = false;
    assert.equal(env.helper.debugReport().pageComplete,true);
    assert.equal(await env.helper.continueCourse(false,narrative,0,'stale-counter'),false);
    assert.equal(env.next.clicks,0);
});

test('long multiple-choice questions prepare offscreen answers before clicking', () => {
    const {helper} = boot(), scope = node(), correct = node('Correct'), wrong = node('Wrong');
    correct.control = {type:'radio',checked:false,click(){this.checked=true;}};
    correct.getBoundingClientRect = () => ({top:1500,bottom:1600,left:0,right:200});
    correct.scrollIntoView = () => { correct.getBoundingClientRect = () => ({top:100,bottom:200,left:0,right:200}); };
    scope.children.set(controlSelector,[correct,wrong]);
    const component = {_component:'mcq',_items:[{text:'Correct',_shouldBeSelected:true},{text:'Wrong',_shouldBeSelected:false}]};
    assert.equal(helper.choiceActions(component,scope).supported,false);
    const result = helper.plan(component,scope,true);
    assert.equal(result.supported,true);
    result.actions[0].prepare(); result.actions[0].apply();
    assert.equal(correct.control.checked,true);
});

test('Next is revalidated after the delay when the SPA route changes', async () => {
    const env = setupNavigation(true);
    env.helper.getPreferences().paced = false;
    const pending = env.helper.continueCourse(false,null,0,'old-route');
    env.location.href += '?view=new-section';
    assert.equal(await pending,false);
    assert.equal(env.next.clicks,0);
});

test('optional, hidden, and unavailable questions do not block required section completion', () => {
    const env = boot(), scope = node();
    env.document.querySelector = () => scope;
    for (const [id,flags] of [['optional',{_isOptional:true}],['hidden',{_isHidden:true}],['unavailable',{_isAvailable:false}]]) {
        env.helper.components.set(id,{_id:id,_component:'matching',...flags});
    }
    assert.equal(env.helper.unfinishedActivities().length,0);
    assert.equal(env.helper.visibleActivities(env.helper.rootsUnder()).length,1); // Optional visible content can still be used.
});

test('visited tabs still open and expose their content when their activity is incomplete', () => {
    const { helper } = boot(), scope = node();
    const tabs = [node('Personal Hotspot'),node('Cellular Hotspot Device')];
    for (const tab of tabs) tab.classList.contains = name => name === 'is-visited';
    scope.children.set('[role=tab]',tabs);
    const views = [];
    scope.scrollIntoView = options => views.push(options.block);
    const component = { _component:'tabs' };
    for (const tab of tabs) {
        let plan = helper.plan(component,scope,true);
        assert.equal(plan.actions[0].node,tab);
        plan.actions[0].apply();
        plan = helper.plan(component,scope,true);
        assert.equal(plan.actions[0].node,scope);
        assert.equal(plan.actions[0].label,'View tab content');
        plan.actions[0].apply();
    }
    assert.deepEqual(views,['end','end']);
    assert.equal(tabs[0].clicks,1);
    assert.equal(tabs[1].clicks,1);
    const pending = helper.plan(component,scope,true);
    assert.equal(pending.waiting,true);
    assert.equal(pending.actions.length,0);
    assert.equal(helper.isComplete(scope),false);
});

test('tab content visits survive replacement buttons and offscreen tabs prepare before clicking', () => {
    const { helper } = boot(), scope = node(), first = node('First'), second = node('Second');
    scope.children.set('[role=tab]',[first,second]);
    const component = { _component:'tabs' };
    helper.plan(component,scope,true).actions[0].apply();
    helper.plan(component,scope,true).actions[0].apply();
    const replacement = node('Second');
    replacement.getBoundingClientRect = () => ({top:-400,bottom:-300,left:0,right:200});
    replacement.scrollIntoView = () => { replacement.getBoundingClientRect = () => ({top:100,bottom:200,left:0,right:200}); };
    scope.children.set('[role=tab]',[node('First'),replacement]);
    assert.equal(helper.lessonActions(component,scope,false).pending,true);
    const next = helper.plan(component,scope,true).actions[0];
    assert.equal(next.node,replacement);
    next.prepare();
    assert.equal(helper.available(replacement),true);
    next.apply();
    assert.equal(replacement.clicks,1);
});

test('at the bottom, a completed question returns Auto to an earlier unfinished video', async () => {
    const env = boot(), videoScope = node(), play = node('Play sample lesson'), completeQuestion = node();
    const offscreen = () => ({top:-1500,bottom:-500,left:0,right:200});
    videoScope.getBoundingClientRect = offscreen;
    play.getBoundingClientRect = offscreen;
    let returned = false;
    play.scrollIntoView = () => { returned = true; };
    videoScope.children.set('button.vjs-big-play-button,video,audio',[play]);
    completeQuestion.matches = selector => selector.startsWith('.is-complete');
    env.helper.components.set('earlier-video',{_id:'earlier-video',_component:'media'});
    env.helper.components.set('finished-matching',{_id:'finished-matching',_component:'matching'});
    env.document.querySelector = selector => selector.includes('earlier-video') ? videoScope : completeQuestion;
    assert.equal(env.helper.pendingCount(),0);
    assert.equal(env.helper.debugReport().pageComplete,false);
    assert.equal(await env.helper.continueCourse(true,completeQuestion,0,'bottom-of-section'),true);
    assert.equal(returned,true);
});

test('recovery includes unread lesson content and ignores completed, optional, and unavailable activities', () => {
    const env = boot(), scopes = new Map();
    const records = [
        {_id:'done',_component:'text'},
        {_id:'optional',_component:'media',_isOptional:true},
        {_id:'unavailable',_component:'media',_isAvailable:false},
        {_id:'unread',_component:'text'}
    ];
    const visited = [];
    for (const record of records) {
        const scope = node();
        scope.getBoundingClientRect = () => ({top:-1200,bottom:-100,left:0,right:200});
        scope.scrollIntoView = () => visited.push(record._id);
        if (record._id === 'done') scope.matches = selector => selector.startsWith('.is-complete');
        scopes.set(record._id,scope); env.helper.components.set(record._id,record);
    }
    env.document.querySelector = selector => [...scopes].find(([id]) => selector.includes('"'+id+'"'))?.[1] || null;
    assert.equal(env.helper.recoverIncompleteActivity(),true);
    assert.deepEqual(visited,['unread']);
    scopes.get('unread').matches = selector => selector.startsWith('.is-complete');
    assert.equal(env.helper.recoverIncompleteActivity(),false);
});



test('a visible video footer with no player cannot starve the next question', async () => {
    const env = setupBatch();
    const question = env.helper.components.get('test');
    env.helper.components.clear();
    env.helper.components.set('previous-video',{ _id:'previous-video',_component:'media' });
    env.helper.components.set('test',question);
    await env.helper.runBatch(true);
    assert.equal(env.correct.control.checked,true);
    assert.equal(env.wrong.control.checked,false);
});

test('an offscreen Play button is scrolled into view instead of waiting for a missing player', () => {
    const { helper } = boot(), scope = node(), play = node('Play');
    play.getBoundingClientRect = () => ({ top:-400,bottom:-350,left:0,right:200 });
    play.scrollIntoView = () => { play.getBoundingClientRect = () => ({ top:100,bottom:150,left:0,right:200 }); };
    scope.children.set('button.vjs-big-play-button',[play]);
    const plan = helper.mediaActions(scope);
    assert.equal(plan.actions.length,1);
    plan.actions[0].prepare();
    assert.equal(helper.available(play),true);
    plan.actions[0].apply();
    assert.equal(play.clicks,1);
});

test('reported js-dropdown buttons resolve row-local options without ARIA combobox roles', () => {
    const { helper } = boot(), scope = node(), row = node('Synthetic statement Please select an option');
    const combo = node('Please select an option'), answer = node('True'), other = node('False');
    const selector = '[role=combobox],[aria-haspopup=listbox],button.js-dropdown-btn';
    combo.parentElement = row; row.parentElement = scope;
    combo.matches = selector => selector === 'button.js-dropdown-btn';
    scope.children.set(selector,[combo]); row.children.set(selector,[combo]);
    row.children.set('[role=option],button,li,.dropdown__item,.dropdown__option',[combo,answer,other]);
    answer.click = () => { answer.clicks++; combo.textContent = 'True'; };
    const component = { _component:'matching',_items:[{text:'Synthetic statement',_options:[{text:'True',_isCorrect:true}]}] };
    let plan = helper.plan(component,scope,true);
    assert.equal(plan.supported,true);
    assert.equal(plan.actions[0].node,combo);
    plan.actions[0].apply();
    plan = helper.plan(component,scope,true);
    assert.equal(plan.actions[0].node,answer);
    plan.actions[0].apply();
    assert.equal(answer.clicks,1);
    assert.equal(other.clicks,0);
    assert.equal(helper.plan(component,scope,true).actions.length,0);
});

test('video starts with the reported Play control, seeks once, and waits for real playback completion', () => {
    const { helper } = boot(), scope = node(), play = node('', { 'aria-label':'Play 7.1.2.1 Video Explanation' });
    const video = node();
    Object.assign(video,{ paused:true,ended:false,duration:120,currentTime:0 });
    scope.children.set('video,audio',[video]);
    scope.children.set('button.vjs-big-play-button',[play]);
    play.click = () => { play.clicks++; video.paused = false; };
    helper.mediaActions(scope).actions[0].apply();
    assert.equal(play.clicks,1);
    helper.mediaActions(scope).actions[0].apply();
    assert.equal(video.currentTime,119);
    assert.equal(video.ended,false);
    let plan = helper.mediaActions(scope);
    assert.equal(plan.waiting,true);
    assert.equal(plan.actions.length,0);
    video.ended = true;
    plan = helper.mediaActions(scope);
    assert.equal(plan.waiting,true);
    assert.match(plan.reason,/waiting for course completion/);
    assert.equal(play.clicks,1);
});

test('unloaded, live, short, and ambiguous videos never receive invalid seeks', () => {
    const { helper } = boot(), scope = node(), video = node();
    Object.assign(video,{ paused:false,ended:false,duration:NaN,currentTime:0 });
    scope.children.set('video,audio',[video]);
    assert.equal(helper.mediaActions(scope).actions.length,0);
    video.duration = Infinity;
    assert.equal(helper.mediaActions(scope).actions.length,0);
    video.duration = 0.5;
    helper.mediaActions(scope).actions[0].apply();
    assert.equal(video.currentTime,0);
    scope.children.set('video,audio',[video,node()]);
    assert.equal(helper.mediaActions(scope).supported,false);
});

test('lab clicks suppress synchronous tabs and link navigation, then restore normal browser behavior', () => {
    const env = boot(), lab = node('Lab'), anchor = node('File');
    const originalOpen = () => { throw new Error('Unwanted new tab'); };
    let listener, removed = false, prevented = false;
    env.window.open = originalOpen;
    env.document.addEventListener = (name,callback) => { assert.equal(name,'click'); listener = callback; };
    env.document.removeEventListener = (name,callback) => { removed = callback === listener; };
    anchor.matches = selector => selector === 'a[href]';
    lab.click = () => {
        assert.equal(env.window.open('/lab.pdf'),null);
        listener({ composedPath:() => [anchor],preventDefault:() => { prevented = true; } });
    };
    env.helper.clickLabControl(lab);
    assert.equal(prevented,true);
    assert.equal(removed,true);
    assert.equal(env.window.open,originalOpen);
    lab.click = () => { throw new Error('Handler failed'); };
    assert.throws(() => env.helper.clickLabControl(lab),/Handler failed/);
    assert.equal(env.window.open,originalOpen);
});

test('course feedback is closed separately before any background question interaction', async () => {
    const env = setupBatch(), popup = node('Close popup'), shellClose = node('Close');
    let open = true;
    popup.click = () => { popup.clicks++; open = false; };
    env.document.querySelectorAll = selector => selector === 'button.js-notify-close-btn' && open ? [popup] :
        selector === 'button,a[href],[role="button"]' ? [shellClose] : [];
    await env.helper.runBatch(true);
    assert.equal(env.correct.control.checked,false);
    assert.equal(env.wrong.control.checked,true);
    assert.equal(popup.clicks,0); // Manual Fill leaves feedback for the user.
    assert.equal(await env.helper.handleFeedbackPopup(0,true),true);
    assert.equal(popup.clicks,1);
    assert.equal(shellClose.clicks,0);
    assert.equal(env.helper.feedbackCloseControls().length,0);
    await env.helper.runBatch(false);
    assert.equal(env.correct.control.checked,true);
});

test('ambiguous feedback popups and Stop never cause a close click', async () => {
    const env = boot(), a = node('Close popup'), b = node('Close popup');
    env.helper.getPreferences().paced = false;
    env.document.querySelectorAll = selector => selector === 'button.js-notify-close-btn' ? [a,b] : [];
    assert.equal(await env.helper.handleFeedbackPopup(0,true),true);
    assert.equal(a.clicks+b.clicks,0);
    env.document.querySelectorAll = selector => selector === 'button.js-notify-close-btn' ? [a] : [];
    const closing = env.helper.handleFeedbackPopup(0,true);
    env.helper.stop();
    await closing;
    assert.equal(a.clicks,0);
});

test('reported offscreen narrative tabs scroll into view and advance one unvisited slide per plan', () => {
    const env = boot(), scope = node();
    const tabs = [1,2,3,4].map(index => node('', { role:'tab','aria-label':'Slide '+index+' of 4' }));
    tabs[0].classList.contains = name => name === 'is-visited' || name === 'is-selected';
    for (const tab of tabs) {
        tab.click = () => { tab.clicks++; tab.classList.contains = name => name === 'is-visited'; };
        tab.getBoundingClientRect = () => ({ top:1500,bottom:1550,left:0,right:200 });
        tab.scrollIntoView = () => { tab.getBoundingClientRect = () => ({ top:100,bottom:150,left:0,right:200 }); };
    }
    scope.children.set('[role=tab],.narrative__progress button',tabs);
    const component = { _component:'narrative' };
    assert.equal(env.helper.lessonActions(component,scope,false).pending,true);
    for (let index=1; index<4; index++) {
        const plan = env.helper.plan(component,scope,true);
        assert.equal(plan.supported,true);
        assert.equal(plan.actions.length,1);
        assert.equal(plan.actions[0].node,tabs[index]);
        plan.actions[0].prepare();
        assert.equal(env.helper.available(tabs[index]),true);
        plan.actions[0].apply();
    }
    assert.equal(env.helper.plan(component,scope,true).actions.length,0);
});

test('connection clicks are retried when the course has not assigned the matching letter', () => {
    const env = boot(), scope = node();
    const source = node('Synthetic device E'), target = node('Description');
    source.parentNode = scope; target.parentNode = scope;
    source.matches = selector => selector === '.objectMatching-category-item';
    target.matches = selector => selector === '.objectMatching-option-item';
    const leaf = node('Synthetic device');
    leaf.closest = selector => selector === '[data-na-answers]' ? null : source;
    scope.children.set('*',[leaf]);
    scope.children.set(controlSelector,[source,target]);
    const component = { _component:'objectMatching',_items:[{question:'Synthetic device',answer:'Description'}] };
    const actions = env.helper.connectionActions(component,scope,true).actions;
    assert.equal(actions.length,2);
    actions.forEach(action => action.apply());
    assert.equal(env.helper.connectionActions(component,scope,true).actions.length,2);
    target.textContent = 'E Description';
    const description = node('Description');
    description.closest = selector => selector === '[data-na-answers]' ? null : target;
    scope.children.set('*',[leaf,description]);
    assert.equal(env.helper.connectionConfirmed(source,target,'Synthetic device','Description'),true);
    assert.equal(env.helper.connectionActions(component,scope,true).actions.length,0);
});

test('course disabled classes block interaction even when native disabled is false', () => {
    const { helper } = boot(), control = node('Back');
    for (const disabled of ['is-disabled','disabled']) {
        control.classList.contains = name => name === disabled;
        assert.equal(helper.available(control),false);
        assert.equal(helper.enabledRendered(control),false);
    }
});

test('a narrative Next slide button cannot compete with course navigation', () => {
    const env = setupNavigation(true), slideNext = node('Next');
    slideNext.matches = selector => selector === '.js-narrative-controls-click,.narrative__controls-item';
    const original = env.document.querySelectorAll;
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [env.next,slideNext] : original(selector);
    assert.equal(reportedNext(env),env.next.getAttribute('aria-label') || env.next.textContent);
});

test('reported verbose Submit label resolves without selecting feedback or disabled actions', () => {
    const { helper } = boot(), scope = node();
    const submit = node('Submit', { 'aria-label':'Submit Your answer will be submitted' });
    const feedback = node('Show feedback', { 'aria-label':'Show feedback' });
    scope.children.set('button,[role="button"]',[submit,feedback]);
    assert.equal(helper.submitControls(scope)[0],submit);
    submit.classList.contains = name => name === 'is-disabled';
    assert.equal(helper.submitControls(scope,true).length,0);
});

test('reported shell Next uses the current section counter, not unrelated completed content', () => {
    const env = boot();
    const next = node('', { 'aria-label':'Go To 7.2. Sample Topic Two' });
    next.className = 'moduleNavBtn--sFwjV next--3dfUb btn btn--link';
    let current = node('7.1. Sample Topic One0 / 3');
    const target = node('7.2. Sample Topic Two0 / 2');
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="submodule-button-"]' ? [node('7.0. Introduction1 / 1'),current,target] :
        selector.startsWith('.page.is-complete') ? [node('Completed leaf')] : [];
    assert.equal(reportedNext(env),null);
    current = node('7.1. Sample Topic One3 / 3');
    assert.equal(reportedNext(env),next.getAttribute('aria-label') || next.textContent);
    next.className = 'moduleNavBtn--sFwjV prev--toZ8Z btn btn--link';
    assert.equal(reportedNext(env),null);
});

test('Auto prepares both offscreen connection endpoints and Fill visible keeps them pending', () => {
    const { helper } = boot(), scope = node();
    const component = { _component:'objectMatching', _items:[{ question:'Source',answer:'Destination' }] };
    const controls = [node('Source'),node('Destination')];
    for (const control of controls) {
        control.getBoundingClientRect = () => ({ top:1200,bottom:1250,left:0,right:200 });
        control.scrollIntoView = () => { control.getBoundingClientRect = () => ({ top:100,bottom:150,left:0,right:200 }); };
    }
    scope.children.set(controlSelector,controls);
    const manual = helper.connectionActions(component,scope,false);
    assert.equal(manual.supported,true);
    assert.equal(manual.pending,true);
    assert.equal(manual.actions.length,0);
    const auto = helper.connectionActions(component,scope,true);
    assert.equal(auto.actions.length,2);
    for (const action of auto.actions) { action.prepare(); assert.equal(helper.available(action.node),true); action.apply(); }
    assert.equal(helper.connectionActions(component,scope).actions.length,0);
});


test('connection guides preserve the supplied pairs and randomization', () => {
    const { helper } = boot();
    const component = clone(fixture);
    assert.equal(helper.decorate(component), true);
    assert.deepEqual({ ...component, body: fixture.body }, fixture);
    assert.equal((component.body.match(/class="na-pair"/g) || []).length, 6);
    for (const item of fixture._items) assert.ok(component.body.includes(item.answer));
    assert.ok(component.body.includes('display:var(--display-cheat, none)'));
    assert.equal(helper.decorate(component), false);
});

test('untrusted pair text cannot introduce script or network elements', () => {
    const component = { _component: 'objectMatching', _id: '" onmouseover="bad', _items: [
        { question: '<img src="https://example.invalid"> <script>bad()</script> &', answer: 'A < B' }
    ] };
    boot().helper.decorate(component);
    assert.ok(!component.body.includes('<img') && !component.body.includes('<script>'));
    assert.ok(component.body.includes('&quot;') && component.body.includes('&amp;'));
});

test('all existing activity types get consistent hints without modifying matching keys', () => {
    const { helper } = boot();
    for (const type of ['matching', 'fillBlanks']) {
        const component = { _component: type, _items: [{ text: 'Q', _options: [
            { text: 'Wrong', _isCorrect: false }, { text: 'Right', _isCorrect: true }
        ] }] };
        const originalItems = clone(component._items);
        assert.equal(helper.decorate(component), true);
        assert.deepEqual(component._items, originalItems);
        assert.ok(component.body.includes('Right') && !component.body.includes('Wrong'));
    }
    for (const type of ['mcq', 'gmcq']) {
        const component = { _component: type, _items: [{ text: 'Right', _shouldBeSelected: true }, { text: 'Wrong' }] };
        assert.equal(helper.decorate(component), true);
        assert.ok(component._items[0].text.includes('data-na-correct'));
        assert.equal(component._items[1].text, 'Wrong');
        assert.equal(helper.decorate(component), false);
    }
    for (const component of [
        { _component: 'stacker', _items: [{ position: [2], _options: { text: 'Card' } }] },
        { _component: 'slider', _correctAnswer: 0 },
        { _component: 'yesNo', _items: [{ _graphic: { alt: 'Image' }, _shouldBeSelected: false }] }
    ]) assert.equal(helper.decorate(component), true);
});

test('malformed and unrelated components remain untouched', () => {
    const { helper } = boot();
    for (const component of [null, {}, { _component: 'objectMatching', _items: [null, {}, { question: 'Missing' }] },
        { _component: 'matching', _items: [{}] }, { _component: 'text', body: 'Original' }]) {
        const before = JSON.stringify(component);
        assert.equal(helper.decorate(component), false);
        assert.equal(JSON.stringify(component), before);
    }
});

test('fetch uses one request, clones the body, and keeps original scoring data for auto', async () => {
    const env = boot(JSON.stringify([fixture]), { headers: {
        'content-encoding': 'gzip', 'content-length': '100', etag: 'old', 'content-type': 'application/json'
    } });
    const response = await env.window.fetch('/en-US/components.json?version=1');
    assert.equal(env.requests(), 1);
    assert.equal(env.original.bodyUsed, false);
    assert.ok((await response.json())[0].body.includes('data-na-answers'));
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('content-type'), 'application/json');
    assert.deepEqual(clone(env.helper.components.get(fixture._id)), fixture);
});

test('fetch preserves earlier captured questions and its original response when a later hint fails', async () => {
    const data = [
        {_id:'first',_component:'mcq',_items:[{text:'Right',_shouldBeSelected:true},{text:'Wrong',_shouldBeSelected:false}]},
        {_id:'malformed',_component:'objectMatching',body:42,_items:[{question:'Question',answer:'Answer'}]},
        {_id:'later',_component:'mcq',_items:[]}
    ];
    const env = boot(JSON.stringify(data));
    const response = await env.window.fetch('/components.json');
    assert.equal(response,env.original);
    assert.deepEqual(await response.json(),data);
    const report = env.helper.debugReport();
    assert.deepEqual(clone(report.assessment.responseCapture),{fetch:1,xhr:0,questionRecords:2});
    assert.equal(report.performanceDiagnostics.counters.refreshRequests,0);
    const scope = node(), right = node('Right'), wrong = node('Wrong');
    right.control = {type:'radio',checked:false,click() { this.checked = true; }};
    wrong.control = {type:'radio',checked:false};
    scope.children.set(controlSelector,[right,wrong]);
    env.document.querySelector = selector => selector.startsWith('[data-adapt-id="first"]') ? scope : null;
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(right.control.checked,true);
});

test('non-target, non-array, failing, and invalid responses remain readable', async () => {
    for (const [url, body, status] of [
        ['/other.json?components.json', '[]', 200], ['/components.json', 'invalid', 200],
        ['/components.json', '{}', 200], ['/components.json', '[]', 404],
        ['/components.json', '[null,{}]', 200]
    ]) {
        const env = boot(body, { status });
        assert.equal(await env.window.fetch(url), env.original);
        assert.equal(env.original.bodyUsed, false);
    }
    for (const url of [new URL('https://www.netacad.com/components.json'), { url: '/components.json' }]) {
        const env = boot(JSON.stringify([fixture]));
        assert.notEqual(await env.window.fetch(url), env.original);
    }
});

test('shuffled connection controls are resolved by text, then paired only once', () => {
    const { helper } = boot();
    const scope = node();
    const controls = fixture._items.flatMap(item => [node(item.question), node(item.answer)]).reverse();
    scope.children.set(controlSelector, controls);
    const result = helper.connectionActions(fixture, scope);
    assert.equal(result.supported, true);
    assert.equal(result.actions.length, 12);
    for (let i = 0; i < 6; i++) {
        assert.equal(result.actions[i*2].node.textContent, fixture._items[i].question);
        assert.equal(result.actions[i*2+1].node.textContent, fixture._items[i].answer);
    }
    result.actions.forEach(action => action.apply());
    assert.equal(helper.connectionActions(fixture, scope).actions.length, 0);
    controls.push(node('Step 1'));
    assert.equal(helper.connectionActions(fixture, scope).supported, false);
});

test('checkbox auto clears incorrect selections and never toggles correct answers off', () => {
    const { helper } = boot();
    const scope = node();
    const correct = node('Correct'), wrong = node('Wrong');
    correct.control = { type: 'checkbox', checked: false, click() { this.checked = !this.checked; } };
    wrong.control = { type: 'checkbox', checked: true, click() { this.checked = !this.checked; } };
    scope.children.set(controlSelector, [correct, wrong]);
    const component = { _items: [{ text: 'Correct', _shouldBeSelected: true }, { text: 'Wrong', _shouldBeSelected: false }] };
    const result = helper.choiceActions(component, scope);
    assert.equal(result.supported, true);
    assert.equal(result.actions[0].node, wrong);
    result.actions.forEach(action => action.apply());
    assert.equal(correct.control.checked, true);
    assert.equal(wrong.control.checked, false);
    assert.equal(helper.choiceActions(component, scope).actions.length, 0);
});

test('matching selects find the correct option regardless of option ordering', () => {
    const { helper } = boot();
    const scope = node(), select = node();
    select.options = [{ textContent: 'Wrong', value: 'x' }, { textContent: 'Right', value: 'y' }];
    select.value = 'x';
    scope.children.set('select', [select]);
    const component = { _items: [{ text: 'Question', _options: [{ text: 'Right', _isCorrect: true }] }] };
    const result = helper.selectActions(component, scope);
    assert.equal(result.supported, true);
    result.actions[0].apply();
    assert.equal(select.value, 'y');
    assert.equal(helper.selectActions(component, scope).actions.length, 0);
});

test('offscreen and disabled controls are skipped', () => {
    const { helper } = boot();
    const control = node();
    control.disabled = true;
    assert.equal(helper.available(control), false);
    control.disabled = false;
    control.getBoundingClientRect = () => ({ top: 1000, bottom: 1050, left: 0, right: 200 });
    assert.equal(helper.available(control), false);
});

function setupBatch() {
    const env = boot();
    const scope = node(), correct = node('Correct'), wrong = node('Wrong'), submit = node('Submit');
    correct.control = { type: 'checkbox', checked: false, click() { this.checked = !this.checked; } };
    wrong.control = { type: 'checkbox', checked: true, click() { this.checked = !this.checked; } };
    scope.children.set(controlSelector, [correct, wrong]);
    scope.children.set('.js-btn-submit,button[type=submit],[data-action=submit]', [submit]);
    env.document.querySelector = () => scope;
    env.helper.components.set('test', { _id: 'test', _component: 'mcq', _items: [
        { text: 'Correct', _shouldBeSelected: true }, { text: 'Wrong', _shouldBeSelected: false }
    ] });
    env.helper.getPreferences().paced = false;
    return { ...env, correct, wrong, submit };
}

test('batch fills visible controls but does not submit by default', async () => {
    const env = setupBatch();
    await env.helper.runBatch(false);
    assert.equal(env.correct.control.checked, true);
    assert.equal(env.wrong.control.checked, false);
    assert.equal(env.submit.clicks, 0);
});

test('optional submission runs once, only after answer state is rechecked', async () => {
    const env = setupBatch();
    env.helper.getPreferences().submit = true;
    await env.helper.runBatch(false);
    await env.helper.runBatch(false);
    assert.equal(env.submit.clicks, 1);
    const ignored = setupBatch();
    ignored.correct.control.click = () => {};
    ignored.helper.getPreferences().submit = true;
    await ignored.helper.runBatch(false);
    assert.equal(ignored.submit.clicks, 0);
});

test('Stop cancels the whole batch before it can change a control or submit', async () => {
    const env = setupBatch();
    env.helper.getPreferences().paced = true;
    env.helper.getPreferences().submit = true;
    const pending = env.helper.runBatch(false);
    env.helper.stop();
    await pending;
    assert.equal(env.correct.control.checked, false);
    assert.equal(env.wrong.control.checked, true);
    assert.equal(env.submit.clicks, 0);
});

test('open shadow roots are discovered even on the component host itself', () => {
    const { helper } = boot();
    const host = node(), shadow = node();
    host.shadowRoot = shadow;
    assert.ok(helper.rootsUnder(host).includes(shadow));
});

test('background tabs do not receive automatic interactions', () => {
    const env = boot();
    env.document.visibilityState = 'hidden';
    assert.equal(env.helper.available(node()), false);
});

test('unsupported activities report manual interaction', () => {
    const { helper } = boot();
    for (const type of ['stacker', 'yesNo']) {
        assert.equal(helper.plan({ _component: type }, node(), true).supported, false);
    }
});

test('pacing is bounded, with prompt cancellation of a pending action', async () => {
    const { helper } = boot();
    assert.equal(helper.delayMilliseconds(false), 90);
    assert.equal(helper.delayMilliseconds(true, () => 0), 650);
    assert.equal(helper.delayMilliseconds(true, () => .999999), 1799);
    const pending = helper.waitForAction(2000, 0);
    helper.stop();
    assert.equal(await pending, false);
});

test('preferences migrate old settings, validate values, and leave auto off on startup', () => {
    const migrated = boot('[]', { storage: { ansEnabled: 'true', ansColor: '#ff00aa' } }).helper.getPreferences();
    assert.equal(migrated.hints, true);
    assert.equal(migrated.color, '#ff00aa');
    const invalid = boot('[]', { storage: { 'course-helper.preferences.v2': '{"color":"bad","theme":"bad"}' } }).helper.getPreferences();
    assert.equal(invalid.color, '#4579f2');
    assert.equal(invalid.theme, 'system');
    assert.equal(invalid.submit, false);
});

test('no updater endpoints, remote UI assets, or injected event handlers remain', () => {
    assert.ok(source.includes('@downloadURL  none') && source.includes('@updateURL    none'));
    assert.ok(!/@import|fonts\.google|greasyfork|onerror=|onload=|<img|sendBeacon|new\s+(?:window\.)?XMLHttpRequest\s*\(|WebSocket/.test(source));
    assert.ok(!/spin_words|card-track|Terms & Conditions|Cheat:/.test(source));
});

test('system theme follows dark/light preference and supports an explicit course theme', () => {
    assert.equal(boot('[]',{ dark:true }).helper.effectiveTheme(),'dark');
    const light = boot();
    assert.equal(light.helper.effectiveTheme(),'light');
    light.helper.getPreferences().theme = 'dark';
    assert.equal(light.helper.effectiveTheme(),'dark');
    light.helper.getPreferences().theme = 'course';
    light.document.body = node('',{ 'data-theme':'light' });
    assert.equal(light.helper.effectiveTheme(),'light');
});

test('panel position clamps into small viewports', () => {
    const { helper } = boot();
    assert.deepEqual(clone(helper.clampPosition(-500,900,330,200,500,400)),{ x:8,y:192 });
    assert.deepEqual(clone(helper.clampPosition(999,999,330,200,200,100)),{ x:8,y:8 });
});

test('pointer dragging and keyboard movement save panel position; Home resets it', () => {
    const env = boot();
    const listeners = new Map();
    const handle = { addEventListener:(name,fn) => listeners.set(name,fn), setPointerCapture() {} };
    const host = { style:{},getBoundingClientRect:() => ({ left:100,top:50,width:330,height:200 }) };
    env.helper.setPanel({ host,querySelector:() => handle });
    env.helper.installPanelDrag();
    listeners.get('pointerdown')({ button:0,pointerId:1,clientX:150,clientY:100,preventDefault() {} });
    listeners.get('pointermove')({ pointerId:1,clientX:300,clientY:220 });
    listeners.get('pointerup')();
    assert.equal(host.style.left,'250px');
    assert.equal(host.style.top,'170px');
    const saved = JSON.parse(env.storage.get('course-helper.preferences.v2'));
    assert.deepEqual(saved.position,{ x:250,y:170 });
    listeners.get('keydown')({ key:'ArrowRight',preventDefault() {} });
    assert.equal(host.style.left,'116px');
    listeners.get('keydown')({ key:'Home',preventDefault() {} });
    assert.equal(env.helper.getPreferences().position,null);
    assert.equal(host.style.left,'');
});

test('the supplied Firefox quiz label ignores hidden position and icon text', () => {
    const env = boot();
    const label = node('mock-command 1 of 4');
    label.childNodes = [{nodeType:3,nodeValue:'mock-command'}, {
        matches:selector => selector.includes('.screenReader-position-text'),
        childNodes:[{nodeType:3,nodeValue:' 1 of 4'}]
    }];
    label.cloneNode = () => { throw Error('text reads must not clone custom elements'); };
    assert.equal(env.helper.labelText(label),'mock-command');
    const scope = node();
    label.control = { type:'radio',checked:false,click() { this.checked = true; } };
    scope.children.set(controlSelector,[label]);
    const result = env.helper.choiceActions({ _items:[{ text:'<b>mock-command</b>',_shouldBeSelected:true }] },scope);
    assert.equal(result.supported,true);
    result.actions[0].apply();
    assert.equal(label.control.checked,true);
});

test('quiz scope can be found through the supplied label ID prefix in a shadow widget', () => {
    const env = boot();
    const host = node(), label = node();
    const root = { host,querySelector:selector => selector.startsWith('label[id^=') ? label : null };
    const result = env.helper.scopeFor({ _id:'synthetic-shadow-question' },[root]);
    assert.equal(result,host);
});

test('wrapped assessment JSON is recognized without intercepting unrelated JSON', async () => {
    const component = { _id:'quiz-q1',_component:'mcq',body:'Question',_items:[{ text:'Right',_shouldBeSelected:true }] };
    const env = boot(JSON.stringify({ assessment:{ questions:[component] } }),{ headers:{ 'content-type':'application/json' } });
    const response = await env.window.fetch('/api/assessments/demo/questions');
    assert.ok((await response.json()).assessment.questions[0]._items[0].text.includes('data-na-correct'));
    assert.equal(env.requests(),1);
    assert.equal(env.original.bodyUsed,false);
    const unrelated = boot('{"profile":{"name":"Example"}}',{ headers:{ 'content-type':'application/json' } });
    assert.equal(await unrelated.window.fetch('/api/profile'),unrelated.original);
});

function assessmentXHR() {
    return class {
        constructor() { this.listeners = new Map(); this.responseType = ''; this.status = 200; this.sends = 0; }
        open(...args) { this.openArgs = args; return 'native-open'; }
        send(...args) { this.sends++; this.sendArgs = args; return 'native-send'; }
        addEventListener(name,listener) { this.listeners.set(name,listener); }
        getResponseHeader() { return 'application/json'; }
        load(data) {
            this.response = data; this.responseText = JSON.stringify(data);
            this.listeners.get('load')?.();
        }
    };
}

test('existing assessment XHR supplies an untouched schema for Auto on an unlabeled question screen', async () => {
    const env = boot('[]',{XMLHttpRequest:assessmentXHR()}), scope = node(), label = node('Right');
    label.control = {type:'radio',checked:false,click() { this.checked = true; }};
    scope.children.set(controlSelector,[label]);
    env.document.querySelector = () => scope;
    env.document.querySelectorAll = selector => selector === 'button.block-button' ? [node('Q1')] : [];
    env.helper.getPreferences().paced = false;
    const xhr = new env.window.XMLHttpRequest();
    assert.equal(xhr.open('POST','/api/adaptive-assessment/question',true),'native-open');
    const body = {questions:[{_id:'xhr-question',_component:'mcq',_items:[{text:'Right',_shouldBeSelected:true}]}]};
    const before = JSON.stringify(body);
    assert.equal(xhr.send('original request body'),'native-send');
    xhr.load(body);
    await env.helper.runAutoOnce();
    assert.equal(label.control.checked,true);
    assert.equal(xhr.sends,1);
    assert.equal(xhr.sendArgs[0],'original request body');
    assert.equal(JSON.stringify(body),before);
    assert.equal(xhr.responseText,before);
    assert.equal(env.helper.debugReport().assessment.responseCapture.xhr,1);
});

test('XHR observation ignores unrelated, cross-origin, failed and malformed data and handles request reuse', () => {
    const env = boot('[]',{XMLHttpRequest:assessmentXHR()});
    const xhr = new env.window.XMLHttpRequest();
    const data = {_id:'question',_component:'mcq',_items:[]};
    for (const url of ['/api/profile','https://example.com/api/questions']) {
        xhr.open('GET',url); xhr.send(); xhr.load(data);
        assert.equal(env.helper.components.size,0);
    }
    xhr.open('GET','/api/questions/one'); xhr.send(); xhr.status = 500; xhr.load(data);
    assert.equal(env.helper.components.size,0);
    xhr.status = 200; xhr.responseText = '{bad json'; xhr.listeners.get('load')();
    assert.equal(env.helper.components.size,0);
    xhr.responseType = 'json'; xhr.load(data);
    assert.equal(env.helper.components.size,1);
    xhr.open('GET','/api/profile'); xhr.send(); xhr.load({_id:'profile',_component:'mcq'});
    assert.equal(env.helper.components.has('profile'),false);
});

test('capture preserves the different cross-origin components.json rules for fetch and XHR', async () => {
    const data = {_id:'transport-question',_component:'mcq',_items:[{text:'Right',_shouldBeSelected:true}]};
    const url = 'https://example.invalid/components.json';
    const fetchEnv = boot(JSON.stringify(data),{headers:{'content-type':'text/plain'}});
    const response = await fetchEnv.window.fetch(url);
    assert.ok((await response.json())._items[0].text.includes('data-na-correct'));
    assert.equal(fetchEnv.requests(),1);
    const xhrEnv = boot('[]',{XMLHttpRequest:assessmentXHR()}), xhr = new xhrEnv.window.XMLHttpRequest();
    xhr.open('GET',url); xhr.send(); xhr.load(data);
    assert.deepEqual(JSON.parse(xhr.responseText),data);
    assert.deepEqual(clone(xhrEnv.helper.debugReport().assessment.responseCapture),{fetch:0,xhr:0,questionRecords:0});
});

test('XHR capture rejects non-JSON content and unsupported native response types', () => {
    const env = boot('[]',{XMLHttpRequest:assessmentXHR()}), xhr = new env.window.XMLHttpRequest();
    const data = {_id:'rejected',_component:'mcq',_items:[]};
    xhr.open('GET','/components.json'); xhr.send();
    xhr.getResponseHeader = () => 'text/plain';
    xhr.load(data);
    assert.equal(env.helper.debugReport().assessment.capturedQuestionSchemas,0);
    xhr.getResponseHeader = () => 'application/json';
    xhr.responseType = 'arraybuffer';
    xhr.load(data);
    const report = env.helper.debugReport();
    assert.equal(report.assessment.responseCapture.xhr,0);
    assert.equal(report.performanceDiagnostics.counters.refreshRequests,0);
    xhr.responseType = 'json';
    xhr.load(data);
    assert.equal(env.helper.debugReport().assessment.capturedQuestionSchemas,1);
});

test('capture refreshes ID-less records without counting them as retained questions', async () => {
    const data = {_component:'mcq',_items:[{text:'Right',_shouldBeSelected:true}]};
    const fetchEnv = boot(JSON.stringify(data));
    const response = await fetchEnv.window.fetch('/components.json');
    assert.ok((await response.json())._items[0].text.includes('data-na-correct'));
    const xhrEnv = boot('[]',{XMLHttpRequest:assessmentXHR()}), xhr = new xhrEnv.window.XMLHttpRequest();
    xhr.open('GET','/components.json'); xhr.send(); xhr.load(data);
    assert.deepEqual(JSON.parse(xhr.responseText),data);
    for (const env of [fetchEnv,xhrEnv]) {
        const report = env.helper.debugReport();
        assert.equal(report.assessment.capturedQuestionSchemas,0);
        assert.equal(report.assessment.responseCapture.questionRecords,0);
        assert.equal(report.performanceDiagnostics.counters.refreshRequests,1);
    }
});

test('XHR capture keeps earlier records when a later native JSON record cannot be cloned', () => {
    const env = boot('[]',{XMLHttpRequest:assessmentXHR()}), xhr = new env.window.XMLHttpRequest();
    const first = {_id:'first',_component:'mcq',_items:[]};
    const malformed = {_id:'cyclic',_component:'mcq',_items:[]};
    malformed.self = malformed;
    xhr.open('GET','/api/questions'); xhr.send();
    xhr.responseType = 'json';
    const nativeResponse = [first,malformed,{_id:'later',_component:'mcq',_items:[]}];
    xhr.response = nativeResponse;
    xhr.listeners.get('load')();
    assert.equal(xhr.response,nativeResponse);
    assert.equal(xhr.response[1].self,malformed);
    const report = env.helper.debugReport();
    assert.equal(report.assessment.capturedQuestionSchemas,1);
    assert.deepEqual(clone(report.assessment.responseCapture),{fetch:0,xhr:1,questionRecords:1});
    assert.equal(report.performanceDiagnostics.counters.refreshRequests,0);
});

test('fetch recognizes hyphenated adaptive-assessment question routes', async () => {
    const data = {_id:'adaptive-q',_component:'mcq',_items:[{text:'Right',_shouldBeSelected:true}]};
    const env = boot(JSON.stringify(data),{headers:{'content-type':'application/json'}});
    await env.window.fetch('/api/adaptive-assessment/question');
    assert.equal(env.helper.components.has('adaptive-q'),true);
    assert.equal(env.requests(),1);
});

test('lab downloads need the option enabled and open the primary file once', () => {
    const env = boot();
    const component = { _component:'packetTracer',_items:[{ _downloadUrl:'en-US/lab.pka',iframeurl:'en-US/lab.pdf' }] };
    const scope = node(), packet = node('Download'), pdf = node('Instructions');
    packet.href = 'https://www.netacad.com/en-US/lab.pka';
    pdf.href = 'https://www.netacad.com/en-US/lab.pdf';
    scope.children.set('a[href]',[packet,pdf]);
    assert.equal(env.helper.labActions(component,scope).supported,false);
    env.helper.getPreferences().labs = true;
    const result = env.helper.labActions(component,scope);
    assert.equal(result.actions.length,1);
    result.actions[0].apply();
    assert.equal(packet.clicks,1);
    assert.equal(pdf.clicks,0);
    assert.equal(env.helper.labActions(component,scope).actions.length,0);
});

test('the reported titled lab viewer opens once per lab even if its button re-renders', async () => {
    const env = boot(), scope = node(), button = node('Synthetic Lab Activity');
    const component = { _id:'synthetic-lab',_component:'packetTracer',_items:[{}] };
    scope.children.set('button.open-dialog',[button]);
    env.document.querySelector = () => scope;
    env.helper.components.set(component._id,component);
    env.helper.getPreferences().paced = false;
    assert.equal(env.helper.plan(component,scope,true).supported,false);
    env.helper.getPreferences().labs = true;
    await env.helper.runBatch(true);
    assert.equal(button.clicks,1);
    const replacement = node('Synthetic Lab Activity');
    scope.children.set('button.open-dialog',[replacement]);
    await env.helper.runBatch(true);
    assert.equal(replacement.clicks,0);
});

test('lab viewer controls scroll into view in Auto and remain pending in manual mode', () => {
    const env = boot(), scope = node(), button = node('Synthetic Lab Activity');
    env.helper.getPreferences().labs = true;
    button.getBoundingClientRect = () => ({ top:1500,bottom:1550,left:0,right:200 });
    button.scrollIntoView = () => { button.getBoundingClientRect = () => ({ top:100,bottom:150,left:0,right:200 }); };
    scope.children.set('button.open-dialog',[button]);
    const component = { _id:'lab',_component:'packetTracer',_items:[{}] };
    const manual = env.helper.labActions(component,scope);
    assert.equal(manual.pending,true);
    assert.equal(manual.actions.length,0);
    const auto = env.helper.plan(component,scope,true);
    assert.equal(auto.actions.length,1);
    auto.actions[0].prepare();
    assert.equal(env.helper.available(button),true);
    auto.actions[0].apply();
    assert.equal(button.clicks,1);
});

test('lab viewer handling rejects ambiguous buttons, missing identities, and unrelated widgets', () => {
    const env = boot(), scope = node(), button = node('Synthetic Lab Activity');
    env.helper.getPreferences().labs = true;
    scope.children.set('button.open-dialog',[button,node('Other lab')]);
    const component = { _id:'lab',_component:'packetTracer',_items:[{}] };
    assert.equal(env.helper.labActions(component,scope).supported,false);
    scope.children.set('button.open-dialog',[button]);
    assert.equal(env.helper.labActions({ ...component,_id:undefined },scope).supported,false);
    assert.equal(env.helper.labActions({ ...component,_component:'text' },scope).supported,false);
    assert.equal(env.helper.labActions({ ...component,_items:[{},{}] },scope).supported,false);
    assert.equal(button.clicks,0);
});

test('a lab download button is supported only when its file and control are unique', () => {
    const env = boot();
    env.helper.getPreferences().labs = true;
    const scope = node(), download = node('Download');
    scope.children.set('button,[role="button"]',[download]);
    const component = { _items:[{ _downloadUrl:'lab.pka' }] };
    const result = env.helper.labActions(component,scope);
    assert.equal(result.supported,true);
    result.actions[0].apply();
    assert.equal(download.clicks,1);
    scope.children.get('button,[role="button"]').push(node('Download'));
    assert.equal(env.helper.labActions(component,scope).supported,false);
});

function reportedNext(env) {
    const next = env.helper.debugReport().navigation.resolvedNext;
    return next && (next.label || next.text);
}

function setupNavigation(complete = false, options = {}) {
    const env = boot('[]',options);
    const next = node('Next module');
    next.href = 'https://www.netacad.com/next-module';
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector.startsWith('.page.is-complete') && complete ? [node('Complete')] : [];
    return { ...env,next };
}

test('Auto cancels course Next when same-route completion disappears during the delay', async () => {
    const completion = [node('Complete')];
    let changed = false;
    const env = setupNavigation(true,{setTimeout(callback,milliseconds) {
        if (milliseconds === 50 && !changed) { completion.length = 0; changed = true; }
        return setTimeout(callback,milliseconds);
    }});
    const query = env.document.querySelectorAll;
    env.document.querySelectorAll = selector => selector.startsWith('.page.is-complete') ? completion : query(selector);
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(changed,true);
    assert.equal(env.next.clicks,0);
    assert.equal(env.helper.debugReport().navigation.resolvedNext,null);
});

test('Auto waits for a fresh pass when the course replaces Next during the delay', async () => {
    let replaceNext = () => {};
    const env = setupNavigation(true,{setTimeout(callback,milliseconds) {
        if (milliseconds === 50) { replaceNext(); replaceNext = () => {}; }
        return setTimeout(callback,milliseconds);
    }});
    const replacement = node('Next module'), controls = [env.next];
    const query = env.document.querySelectorAll;
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? controls : query(selector);
    replaceNext = () => { controls[0] = replacement; };
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,0);
    assert.equal(replacement.clicks,0);
    await env.helper.runAutoOnce();
    assert.equal(replacement.clicks,1);
});

test('Auto does not follow a reused Next control whose destination label changes during the delay', async () => {
    let changeLabel = () => {};
    const env = setupNavigation(true,{setTimeout(callback,milliseconds) {
        if (milliseconds === 50) { changeLabel(); changeLabel = () => {}; }
        return setTimeout(callback,milliseconds);
    }});
    env.next.setAttribute('aria-label','Next module');
    changeLabel = () => env.next.setAttribute('aria-label','Next section');
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,0);
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,1);
});

test('completed summary advances to the reported Module Exam destination without an outline count', async () => {
    const env = boot();
    const next = node('',{'aria-label':'Go To 7.9. Module Exam'});
    next.className = 'moduleNavBtn--sFwjV next--3dfUb btn btn--link';
    const summary = node('7.8. Summary2 / 2'), exam = node('7.9. Module Exam');
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="submodule-button-"]' ? [summary,exam] : [];
    env.helper.getPreferences().paced = false;
    assert.equal(reportedNext(env),next.getAttribute('aria-label') || next.textContent);
    await env.helper.runAutoOnce();
    assert.equal(next.clicks,1);
    await env.helper.runAutoOnce();
    assert.equal(next.clicks,1);
});

test('an exam destination without a count still requires its preceding section complete', () => {
    const env = boot();
    const next = node('',{'aria-label':'Go To 7.9. Module Exam'});
    next.className = 'moduleNavBtn--sFwjV next--3dfUb';
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="submodule-button-"]' ? [node('7.8. Summary1 / 2'),node('7.9. Module Exam')] : [];
    assert.equal(reportedNext(env),null);
});

test('module navigation requires an explicit page completion signal', () => {
    const incomplete = setupNavigation(false);
    assert.equal(reportedNext(incomplete),null);
    const complete = setupNavigation(true);
    assert.equal(reportedNext(complete),complete.next.getAttribute('aria-label') || complete.next.textContent);
});

test('quiz Next is allowed after question completion but not before', async () => {
    const env = setupNavigation(false), scope = node();
    env.next.textContent = 'Next question';
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,0);
    env.helper.components.set('completed-question',{_id:'completed-question',_component:'mcq',_items:[]});
    scope.matches = selector => selector.startsWith('.is-complete');
    env.document.querySelector = () => scope;
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,1);
});

test('ambiguous Next controls are not clicked', () => {
    const env = setupNavigation(true);
    const old = env.document.querySelectorAll;
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ?
        [env.next,node('Next section')] : old(selector);
    assert.equal(reportedNext(env),null);
});

test('completed module navigation clicks once and carries a short-lived exact-destination resume', async () => {
    const env = setupNavigation(true);
    env.helper.getPreferences().paced = false;
    assert.equal(await env.helper.continueCourse(false,null,0,'page-1'),true);
    assert.equal(env.next.clicks,1);
    assert.equal(await env.helper.continueCourse(false,null,0,'page-1'),false);
    const resume = JSON.parse(env.session.get('course-helper.next-page'));
    assert.equal(resume.url,env.next.href);
    assert.ok(resume.expires > Date.now() && resume.expires <= Date.now()+60000);
    assert.equal(env.helper.resumePending(),false);
    env.helper.stop();
    assert.equal(env.session.has('course-helper.next-page'),false);
});

test('same-document and external links cannot create an auto-resume token', () => {
    const env = boot();
    env.helper.rememberNavigation({ href:'https://example.invalid/next' });
    env.helper.rememberNavigation({ href:'https://www.netacad.com/launch#next' });
    assert.equal(env.session.size,0);
});

test('connection spotlight highlights the target and guide row without changing pair values', () => {
    const env = boot();
    env.helper.getPreferences().hints = true;
    const component = clone(fixture), scope = node(), row = node();
    const controls = component._items.flatMap(item => [node(item.question),node(item.answer)]);
    controls.forEach(control => { control.parentNode = scope; });
    scope.children.set(controlSelector,controls);
    scope.children.set('[data-na-pair-index="2"]',[row]);
    env.document.querySelector = () => scope;
    env.helper.components.set(component._id,component);
    const before = clone(component);
    env.helper.handleConnectionSelection({ composedPath:() => [controls[4],scope] });
    assert.equal(controls[4].getAttribute('data-na-pair-source'),'');
    assert.equal(controls[5].getAttribute('data-na-pair-target'),'');
    assert.equal(row.getAttribute('data-na-pair-source'),'');
    assert.deepEqual(component,before);
    env.helper.getPreferences().hints = false;
    env.helper.updatePairHighlights();
    assert.equal(controls[5].getAttribute('data-na-pair-target'),null);
});

test('a quiz that locks its answers after submission is recognized as finished', async () => {
    const env = setupBatch();
    env.helper.getPreferences().submit = true;
    env.submit.click = () => {
        env.submit.clicks++;
        env.correct.control.disabled = true; env.wrong.control.disabled = true;
    };
    const scope = env.document.querySelector();
    scope.children.set('input[type=radio],input[type=checkbox],select,input[type=range]',[env.correct.control,env.wrong.control]);
    await env.helper.runBatch(false);
    assert.equal(env.helper.questionFinished(env.helper.components.get('test'),scope),true);
    await env.helper.runBatch(false);
    assert.equal(env.helper.pendingCount(),0);
    assert.equal(env.submit.clicks,1);
});

test('unfinished questions block module navigation even if another completion marker is present', async () => {
    const env = setupBatch();
    await env.helper.runBatch(false);
    assert.equal(env.helper.pendingCount(),1);
    assert.equal(await env.helper.continueCourse(true,null,0,'unfinished-question'),false);
});

test('not completed and incomplete labels never grant permission to navigate', () => {
    const { helper } = boot();
    assert.equal(helper.isCompletionLabel('Module 6 - Completed'),true);
    assert.equal(helper.isCompletionLabel('100%'),true);
    assert.equal(helper.isCompletionLabel('Not completed'),false);
    assert.equal(helper.isCompletionLabel('Incomplete'),false);
});

test('Stop interrupts a pending navigation click', async () => {
    const env = setupNavigation(true);
    const pending = env.helper.continueCourse(false,null,0,'page-1');
    env.helper.stop();
    assert.equal(await pending,false);
    assert.equal(env.next.clicks,0);
    assert.equal(env.session.size,0);
});

test('auto resumes only at the exact planned destination and consumes the resume token', () => {
    const env = boot();
    env.helper.rememberNavigation({ href:'https://www.netacad.com/next-module' });
    assert.equal(env.helper.resumePending(),false);
    env.location.href = 'https://www.netacad.com/next-module';
    assert.equal(env.helper.resumePending(),true);
    assert.equal(env.session.size,0);
    env.session.set('course-helper.next-page',JSON.stringify({ url:env.location.href,expires:Date.now()-1 }));
    assert.equal(env.helper.resumePending(),false);
    assert.equal(env.session.size,0);
});

test('quiz Submit controls also resolve by accessible text when their classes differ', () => {
    const env = boot(), scope = node(), submit = node('Submit'), reset = node('Reset');
    scope.children.set('button,[role="button"]',[reset,submit]);
    const controls = env.helper.submitControls(scope);
    assert.equal(controls.length,1);
    assert.equal(controls[0],submit);
});

test('Submit is found in a sibling footer outside the narrow widget', () => {
    const env = boot(), widget = node(), shell = node(), submit = node('Submit');
    widget.parentElement = shell;
    shell.children.set('button,[role="button"]',[submit]);
    assert.equal(env.helper.submitControls(widget).length,0);
    assert.equal(env.helper.submitControls(widget,false,true)[0],submit);
});

test('automatic Submit can discover and scroll to an offscreen footer', () => {
    const env = boot(), scope = node(), submit = node('Submit');
    submit.getBoundingClientRect = () => ({ top:1500,bottom:1550,left:0,right:200 });
    scope.children.set('button,[role="button"]',[submit]);
    assert.equal(env.helper.submitControls(scope).length,0);
    assert.equal(env.helper.submitControls(scope,true)[0],submit);
});

test('multiple dropdown rows can fill visible rows while other rows are offscreen', () => {
    const env = boot(), scope = node(), first = node(), second = node();
    const rowA = node('Question A'), rowB = node('Question B');
    rowA.children.set('select',[first]); rowB.children.set('select',[second]);
    first.parentElement = rowA; second.parentElement = rowB;
    rowA.parentElement = scope; rowB.parentElement = scope;
    for (const select of [first,second]) {
        select.options = [{ textContent:'Right',value:'correct' }]; select.value = '';
    }
    second.getBoundingClientRect = () => ({ top:1500,bottom:1550,left:0,right:200 });
    scope.children.set('select',[first,second]);
    const component = { _items:['Question A','Question B'].map(text => ({ text,_options:[{ text:'Right',_isCorrect:true }] })) };
    const visible = env.helper.selectActions(component,scope);
    assert.equal(visible.supported,true);
    assert.equal(visible.actions.length,1);
    assert.equal(visible.pending,true);
    const auto = env.helper.selectActions(component,scope,true);
    assert.equal(auto.actions.length,2);
    assert.equal(typeof auto.actions[1].prepare,'function');
});

test('a hidden native select can use its rendered custom dropdown proxy', () => {
    const env = boot(), scope = node(), select = node(), row = node('Question'), proxy = node('Choose');
    select.getClientRects = () => [];
    select.parentElement = row; row.parentElement = scope;
    select.options = [{ textContent:'Right',value:'correct' }]; select.value = '';
    row.children.set('select',[select]);
    row.children.set('[role=combobox],.select2-selection,[aria-haspopup=listbox]',[proxy]);
    scope.children.set('select',[select]);
    const result = env.helper.selectActions({ _items:[{ text:'Question',_options:[{ text:'Right',_isCorrect:true }] }] },scope);
    assert.equal(result.supported,true);
    assert.equal(result.actions[0].node,proxy);
    result.actions[0].apply();
    assert.equal(select.value,'correct');
});

test('custom dropdowns select an option rendered in a portal outside the widget', () => {
    const env = boot(), scope = node(), combo = node('Please select an option'), list = node(), option = node('Synthetic device');
    scope.children.set('[role=combobox],[aria-haspopup=listbox]',[combo]);
    const component = { _items:[{ text:'Question',_options:[{ text:'Synthetic device',_isCorrect:true }] }] };
    const first = env.helper.selectActions(component,scope);
    assert.equal(first.supported,true);
    first.actions[0].apply();
    assert.equal(combo.clicks,1);
    env.document.querySelectorAll = selector => selector === '[role=listbox]' ? [list] : [];
    list.children.set('[role=option]',[option]);
    option.click = () => { option.clicks++; combo.textContent = 'Synthetic device'; };
    const second = env.helper.selectActions(component,scope);
    assert.equal(second.actions[0].node,option);
    second.actions[0].apply();
    assert.equal(option.clicks,1);
    assert.equal(env.helper.selectActions(component,scope).actions.length,0);
});

test('a nested course scroller is used when the document itself does not scroll', () => {
    const env = boot('[]',{ overflowY:'auto' }), scroller = node();
    scroller.clientHeight = 500; scroller.scrollHeight = 2000; scroller.scrollTop = 0;
    scroller.getBoundingClientRect = () => ({ top:0,bottom:500,left:400,right:1200,width:800 });
    scroller.scrollBy = options => { scroller.scrollTop += options.top; };
    env.document.scrollingElement = { clientHeight:800,scrollHeight:800,scrollTop:0 };
    env.document.querySelectorAll = selector => selector === '*' ? [scroller] : [];
    assert.equal(env.helper.scrollForward(null),true);
    assert.equal(scroller.scrollTop,350);
});

test('discovery yields across retained schemas and releases DOM caches between chunks', async () => {
    let yields = 0, scans = 0;
    const env = boot('[]',{setTimeout:(callback,delay) => {
        assert.equal(delay,0); yields++; return setTimeout(callback,0);
    }});
    env.document.querySelectorAll = () => { scans++; return []; };
    for (let i=0; i<25; i++) env.helper.components.set('absent-'+i,{_id:'absent-'+i,_component:'graphic'});
    const entries = await env.helper.discoverActivities();
    assert.equal(entries.length,0);
    assert.equal(yields,3);
    assert.ok(scans >= 4);
    assert.equal(env.helper.performanceReport().pause,null);
    assert.equal(env.helper.performanceReport().recent.filter(read => read.operation === 'Discover pending and visible activities').length,4);
});

test('stopping during a discovery yield cancels the remaining scan and preserves pending state', async () => {
    let yields = 0;
    const env = boot('[]',{setTimeout:callback => {
        yields++; env.helper.stop(); return setTimeout(callback,0);
    }});
    for (let i=0; i<25; i++) env.helper.components.set('absent-'+i,{_id:'absent-'+i,_component:'graphic'});
    env.helper.pendingQuestions.add('existing');
    assert.equal(await env.helper.discoverActivities(),null);
    assert.equal(yields,1);
    assert.equal(env.helper.pendingCount(),1);
});

test('text discovery excludes nested guides without cloning or modifying course elements', () => {
    const env = boot(), question = node(), guide = node();
    guide.matches = selector => selector.includes('[data-na-answers]');
    guide.childNodes = [{nodeType:3,nodeValue:'Injected answer'}];
    question.childNodes = [{nodeType:3,nodeValue:'Question '},guide,{nodeType:3,nodeValue:'body'}];
    question.cloneNode = () => { throw Error('custom element constructor must not run'); };
    assert.equal(env.helper.withDOMReads(() => env.helper.labelText(question)),'Question body');
    assert.equal(question.childNodes[1],guide);
    assert.equal(env.helper.performanceReport().readPerformance.last.textClones,0);
});

test('a composed connection event is handled once across observed shadow roots', () => {
    const env = boot();
    env.helper.getPreferences().hints = true;
    const event = {composedPath:() => []};
    env.helper.handleConnectionSelection(event);
    const passes = env.helper.performanceReport().readPerformance.passes;
    for (let i=0; i<6; i++) env.helper.handleConnectionSelection(event);
    assert.equal(env.helper.performanceReport().readPerformance.passes,passes);
});

test('a route change during discovery discards the old lesson scan', async () => {
    const env = boot('[]',{setTimeout:callback => {
        env.location.href = 'https://www.netacad.com/launch?view=another-lesson';
        return setTimeout(callback,0);
    }});
    for (let i=0; i<9; i++) env.helper.components.set('absent-'+i,{_id:'absent-'+i,_component:'graphic'});
    assert.equal(await env.helper.discoverActivities(),null);
});

test('hidden and unavailable component records are filtered before any widget lookup', async () => {
    const env = boot();
    for (const [id,flags] of [['hidden',{_isHidden:true}],['deleted',{_isDeleted:true}],
        ['unavailable',{_isAvailable:false}],['invisible',{_isVisible:false}]]) {
        env.helper.components.set(id,{_id:id,_component:'mcq',body:'Absent question',...flags});
    }
    env.document.querySelectorAll = env.document.querySelector = () => { throw Error('excluded records must not inspect DOM'); };
    assert.equal(env.helper.visibleActivities([env.document]).length,0);
    assert.equal((await env.helper.discoverActivities()).length,0);
    assert.equal(env.helper.performanceReport().discovery.components,0);
});

test('discovery reports its batches and returns an independent summary snapshot', async () => {
    const env = boot();
    for (let i=0; i<17; i++) env.helper.components.set('absent-'+i,{_id:'absent-'+i,_component:'graphic'});
    await env.helper.discoverActivities();
    const report = env.helper.performanceReport();
    assert.equal(report.discovery.processed,17);
    assert.equal(report.discovery.batches,3);
    assert.equal(report.discovery.yields,2);
    assert.equal(report.discovery.cancelled,null);
    report.discovery.processed = -1;
    assert.equal(env.helper.performanceReport().discovery.processed,17);
});

test('Auto discards a delayed activity click when the user changes lessons', async () => {
    const env = boot(), scope = node(), tab = node('A');
    tab.scrollIntoView = () => {};
    scope.children.set('[role=tab]',[tab]); scope.children.set(controlSelector,[tab]);
    env.document.querySelector = () => scope;
    env.helper.components.set('tabs',{_id:'tabs',_component:'tabs'});
    env.helper.getPreferences().paced = false;
    const pending = env.helper.runAutoOnce();
    setTimeout(() => { env.location.href += '?view=other-lesson'; },25);
    await pending;
    assert.equal(tab.clicks,0);
});

test('offscreen runtime lookup excludes hidden retained quiz questions before reading text', () => {
    const env = boot(), hidden = node('Question body'), shown = node('Question body');
    hidden.getClientRects = () => [];
    hidden.querySelector = () => { throw Error('hidden widget text must not be inspected'); };
    shown.getBoundingClientRect = () => ({top:2000,bottom:2100,left:0,right:200});
    env.document.querySelectorAll = selector => selector === 'fieldset,.question,.mcq,[data-question-id]' ? [hidden,shown] : [];
    const component = {_id:'schema-id',_component:'mcq',body:'Question body',_items:[]};
    assert.equal(env.helper.withDOMReads(() => env.helper.scopeFor(component,[env.document],false)),shown);
    assert.equal(env.helper.withDOMReads(() => env.helper.scopeFor(component,[env.document],true)),null);
});

function finalExamNavigation() {
    const env = boot(), next = node('',{'aria-label':'Go To Practice Final Exam Modules 1-9'});
    next.className = 'moduleNavBtn--sFwjV next--3dfUb btn btn--link';
    env.location.href = 'https://www.netacad.com/authoring-resources/index.html?moduleNumber=9#/courses/example';
    const module = node('Module 9: Sample Topic Nine100%');
    const practice = node('Practice Final Exam Modules 1–9');
    const final = node('Final Exam Modules 1-9');
    const outline = [node('Module 8: Sample Devices100%'),module,practice,final];
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="node-button-"]' ? outline :
        selector.startsWith('.page.is-complete') ? [node('Complete')] : [];
    env.helper.getPreferences().paced = false;
    return {...env,next,module,practice,final,outline};
}

test('reported completed Module 9 advances to the immediately following Practice Final Exam', async () => {
    const env = finalExamNavigation();
    assert.equal(reportedNext(env),env.next.getAttribute('aria-label') || env.next.textContent);
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,1);
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,1);
});

test('top-level exam navigation requires the current module complete and a unique immediate destination', () => {
    const env = finalExamNavigation();
    env.module.textContent = 'Module 9: Sample Topic Nine80%';
    assert.equal(reportedNext(env),null);
    env.module.textContent = 'Module 9: Sample Topic Nine100%';
    env.location.href = 'https://www.netacad.com/authoring-resources/index.html?moduleNumber=8';
    assert.equal(reportedNext(env),null);
    env.location.href = 'https://www.netacad.com/authoring-resources/index.html?moduleNumber=9';
    env.outline.splice(2,0,node('Unrelated outline entry100%'));
    assert.equal(reportedNext(env),null);
    env.outline.splice(2,1);
    env.outline.push(node('Practice Final Exam Modules 1-9'));
    assert.equal(reportedNext(env),null);
});

test('Practice Final results advance to Final only with an active results screen and every question answered', async () => {
    const env = finalExamNavigation();
    env.next.setAttribute('aria-label','Go To Final Exam Modules 1-9');
    const result = node('Result Page',{'aria-label':'Result Page'});
    const strip = Array.from({length:22},(_,i) => node('',{'aria-label':'answered Question '+(i+1)}));
    const query = env.document.querySelectorAll;
    let results = [];
    env.document.querySelectorAll = selector => selector === 'button.review-screen-button.active-block' ? results :
        selector === 'button.block-button[aria-label]' ? strip : query(selector);
    assert.equal(reportedNext(env),null);
    results = [result];
    strip[21].setAttribute('aria-label','unanswered Question 22');
    assert.equal(reportedNext(env),null);
    strip[21].setAttribute('aria-label','answered Question 22');
    assert.equal(reportedNext(env),env.next.getAttribute('aria-label') || env.next.textContent);
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,1);
});

function completedFinalResults() {
    const env = boot('[]',{url:'https://www.netacad.com/authoring-resources/index.html?moduleNumber=0#/courses/test-course/final-10-14/id/final-page'});
    const next = node('',{'aria-label':'Go To Synthetic Track One Practice Exam'});
    next.className = 'moduleNavBtn--sFwjV next--3dfUb btn btn--link';
    const current = node('Final Exam Modules 10-14100%');
    current.id = 'node-button-final-10-14';
    const result = node('Result Page',{'aria-label':'Result Page'});
    const strip = Array.from({length:45},(_,i) => node('Q'+(i+1),{'aria-label':'answered Question '+(i+1)}));
    const results = [result], outline = [node('Module 14: Sample Topic Fourteen100%'),current,node('Synthetic Practice Exams')];
    const reset = node('Reset'), review = node('Review Assessment');
    const controls = [next,reset,review];
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? controls :
        selector === 'button[id^="node-button-"]' ? outline :
        selector === 'button.review-screen-button.active-block' ? results :
        selector === 'button.block-button[aria-label]' ? strip : [];
    env.helper.getPreferences().paced = false;
    return {...env,next,current,result,strip,results,outline,controls,reset,review};
}

test('completed 45-question final results advance once to certification practice with its outline collapsed', async () => {
    const env = completedFinalResults();
    assert.equal(env.helper.debugReport().pageComplete,true);
    assert.equal(reportedNext(env),env.next.getAttribute('aria-label') || env.next.textContent);
    await env.helper.runAutoOnce();
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,1);
    assert.equal(env.reset.clicks+env.review.clicks,0);
});

test('result navigation requires the current route own completion, unique active results and complete question strip', () => {
    const env = completedFinalResults();
    env.current.textContent = 'Final Exam Modules 10-1490%';
    assert.equal(reportedNext(env),null);
    env.current.textContent = 'Final Exam Modules 10-14100%';
    env.current.id = 'node-button-another-exam';
    assert.equal(reportedNext(env),null);
    env.current.id = 'node-button-final-10-14';
    env.results.length = 0;
    assert.equal(reportedNext(env),null);
    env.results.push(env.result,env.result);
    assert.equal(reportedNext(env),null);
    env.results.pop();
    env.strip[44].setAttribute('aria-label','selected Question 45');
    assert.equal(reportedNext(env),null);
    env.strip[44].setAttribute('aria-label','answered Question 45');
    assert.equal(reportedNext(env),env.next.getAttribute('aria-label') || env.next.textContent);
    env.controls.push(env.next);
    assert.equal(reportedNext(env),null);
});

function certificationResults() {
    const env = completedFinalResults();
    env.location.href = 'https://www.netacad.com/authoring-resources/index.html?moduleNumber=0#/courses/test-course/certification/id/exam-1101';
    env.current.id = 'node-button-certification';
    env.current.textContent = 'Synthetic Practice Exams50%';
    env.next.setAttribute('aria-label','Go To Synthetic Track Two Practice Exam');
    const first = node('Synthetic Track One Practice Exam200 Pts');
    const second = node('Synthetic Track Two Practice Exam200 Pts');
    first.id = second.id = 'submodule-button-certification';
    const sections = [first,second], complete = [node('Completed current page')];
    env.strip.splice(0,env.strip.length,...Array.from({length:44},(_,i) =>
        node('Q'+(i+37),{'aria-label':'answered Question '+(i+37)})));
    const query = env.document.querySelectorAll;
    env.document.querySelectorAll = selector => selector === 'button[id^="submodule-button-"]' ? sections :
        selector.startsWith('.page.is-complete') ? complete : query(selector);
    return {...env,sections,complete};
}

test('completed 1101 results advance to 1102 within a 50% certification group with only Q37–Q80 rendered', async () => {
    const env = certificationResults();
    assert.equal(reportedNext(env),env.next.getAttribute('aria-label') || env.next.textContent);
    await env.helper.runAutoOnce();
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,1);
    assert.equal(env.reset.clicks+env.review.clicks,0);
});

test('results navigation preserves gapped answered windows but rejects duplicate question numbers', async () => {
    const env = certificationResults();
    env.strip.splice(1,1); // Q37, Q39–Q80: existing results-only behavior, not a full strip.
    env.strip.push(node('Q80',{'aria-label':'answered Question 80'}));
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,0);
    env.strip.pop();
    await env.helper.runAutoOnce();
    assert.equal(env.next.clicks,1);
});

test('nested exam navigation requires native page completion and a unique following exam in the route group', () => {
    const env = certificationResults();
    env.complete.length = 0;
    assert.equal(reportedNext(env),null);
    env.complete.push(node('Complete'));
    env.sections[1].id = 'submodule-button-unrelated';
    assert.equal(reportedNext(env),null);
    env.sections[1].id = 'submodule-button-certification';
    env.sections.push(env.sections[1]);
    assert.equal(reportedNext(env),null);
    env.sections.pop();
    env.strip[0].setAttribute('aria-label','unanswered Question 37');
    assert.equal(reportedNext(env),null);
    env.strip[0].setAttribute('aria-label','answered Question 37');
    env.results.length = 0;
    assert.equal(reportedNext(env),null);
    env.results.push(env.result);
    assert.equal(reportedNext(env),env.next.getAttribute('aria-label') || env.next.textContent);
});

test('a completed page and partial answered strip cannot authorize an unrelated course destination', () => {
    const env = certificationResults();
    env.next.setAttribute('aria-label','Go To Unrelated Synthetic Final Exam');
    assert.equal(reportedNext(env),null);
    env.next.setAttribute('aria-label','Go To Synthetic Track One Practice Exam');
    assert.equal(reportedNext(env),null);
});

test('nested results recognize a native current-page completion marker in the same-origin shell', () => {
    const env = certificationResults();
    env.complete.length = 0;
    const shell = {querySelectorAll: selector => selector.startsWith('.page.is-complete') ? [node('Complete')] : []};
    env.window.parent = {document:shell};
    assert.equal(reportedNext(env),env.next.getAttribute('aria-label') || env.next.textContent);
});

const courseFrameURL = module => 'https://www.netacad.com/authoring-resources/index.html?moduleNumber='+module+
    '#/courses/test-course/module-'+module+'/id/intro';

function persistentAutoFrame(module,session) {
    const env = boot('[]',{url:courseFrameURL(module),session,setTimeout:() => 1,clearTimeout:() => {}});
    // Starting in a hidden tab lets these lifecycle tests avoid activity actions.
    env.document.visibilityState = 'hidden';
    return env;
}

test('explicit Auto survives button navigation, frame replacement and reload throughout the same course', () => {
    const first = persistentAutoFrame(9);
    assert.equal(first.helper.resumePending(),false);
    first.helper.startAuto();
    assert.equal(first.helper.performanceReport().autoSession.status,'running');
    first.helper.rememberNavigation(node('',{'aria-label':'Go To 10.0. Introduction'})); // No href.
    first.windowListeners.get('pagehide')();
    assert.equal(first.helper.performanceReport().automatic,false);
    const second = persistentAutoFrame(10,first.session);
    assert.equal(second.helper.resumePending(),true);
    second.helper.startAuto();
    assert.equal(second.helper.performanceReport().automatic,true);
    second.windowListeners.get('pagehide')();
    const reloaded = persistentAutoFrame(10,first.session);
    assert.equal(reloaded.helper.resumePending(),true);
    reloaded.helper.startAuto();
    reloaded.windowListeners.get('pagehide')();
    const third = persistentAutoFrame(11,first.session);
    assert.equal(third.helper.resumePending(),true);
    third.helper.stop();
    assert.equal(third.helper.resumePending(),false);
    assert.equal(persistentAutoFrame(11,first.session).helper.resumePending(),false);
});

test('course Auto intent does not start a different course or an unrelated launch', () => {
    const first = persistentAutoFrame(9);
    first.helper.startAuto(); first.windowListeners.get('pagehide')();
    const other = boot('[]',{url:courseFrameURL(10).replace('test-course','other-course'),session:first.session});
    assert.equal(other.helper.resumePending(),false);
    other.helper.stop();
    assert.equal(persistentAutoFrame(10,first.session).helper.resumePending(),true);
    const shell = boot('[]',{url:'https://www.netacad.com/launch?id=another-launch',session:first.session});
    assert.equal(shell.helper.resumePending(),false);
});

test('a performance pause persists as paused instead of restarting after a frame reload', async () => {
    let clock = 0;
    const env = boot('[]',{url:courseFrameURL(9),performance:{now:() => clock},setTimeout:() => 1,clearTimeout:() => {}});
    env.document.visibilityState = 'hidden'; env.helper.startAuto();
    env.document.visibilityState = 'visible';
    env.document.querySelectorAll = () => { clock += 300; return []; };
    await env.helper.runAutoOnce();
    assert.equal(env.helper.performanceReport().autoSession.status,'paused');
    const next = persistentAutoFrame(10,env.session);
    assert.equal(next.helper.resumePending(),false);
    next.helper.startAuto();
    assert.equal(next.helper.performanceReport().autoSession.status,'running');
    next.helper.stop();
});

test('transient control errors retain Auto intent and retry with backoff instead of stopping', async () => {
    const delays = [];
    const env = boot('[]',{url:courseFrameURL(10),setTimeout:(_,delay) => { delays.push(delay); return 1; },clearTimeout:() => {}});
    env.document.querySelectorAll = () => { throw Error('Course widget is replacing its controls'); };
    env.helper.startAuto();
    await new Promise(resolve => setTimeout(resolve,0));
    let report = env.helper.performanceReport();
    assert.equal(report.automatic,true);
    assert.equal(report.autoSession.status,'running');
    assert.equal(report.lastControlError.retryMilliseconds,1000);
    await env.helper.runBatch(true);
    report = env.helper.performanceReport();
    assert.equal(report.controlRetries,2);
    assert.equal(report.lastControlError.retryMilliseconds,2000);
    assert.deepEqual(delays,[1000,2000]);
    for (let i=0; i<8; i++) await env.helper.runBatch(true);
    assert.equal(env.helper.performanceReport().lastControlError.retryMilliseconds,30000);
    assert.ok(delays.every(delay => delay <= 30000));
    env.document.visibilityState = 'hidden';
    await env.helper.runBatch(true);
    assert.equal(env.helper.performanceReport().controlRetries,0);
    env.helper.stop();
    assert.equal(env.helper.resumePending(),false);
});

test('Synthetic token matching answer beginning with A is not mistaken for an assigned A badge', () => {
    const env = boot(), scope = node();
    const question = 'Blue marker', answer = 'A bright blue marker.';
    const source = node(question+' A'), target = node(answer), leaf = node(question);
    source.parentNode = target.parentNode = scope;
    source.matches = selector => selector === '.objectMatching-category-item';
    target.matches = selector => selector === '.objectMatching-option-item';
    leaf.closest = selector => selector === '[data-na-answers]' ? null : source;
    scope.children.set(controlSelector,[source,target]); scope.children.set('*',[leaf]);
    const component = {_component:'objectMatching',_items:[{question,answer}]};
    assert.equal(env.helper.connectionConfirmed(source,target,question,answer),false);
    let plan = env.helper.connectionActions(component,scope,true);
    assert.equal(plan.supported,true);
    assert.equal(plan.actions.length,2);
    plan.actions.forEach(action => action.apply());
    // A click alone is not completion: retry until the course adds the badge.
    assert.equal(env.helper.connectionActions(component,scope,true).actions.length,2);
    target.textContent = 'A '+answer;
    const answerLeaf = node(answer);
    answerLeaf.closest = selector => selector === '[data-na-answers]' ? null : target;
    scope.children.set('*',[leaf,answerLeaf]);
    assert.equal(env.helper.connectionConfirmed(source,target,question,answer),true);
    assert.equal(env.helper.connectionActions(component,scope,true).actions.length,0);
});

test('connection badge checks require an extra exact letter, including shuffled source badges', () => {
    const env = boot(), source = node('Blue marker J'), target = node('A bright blue marker.');
    source.matches = selector => selector === '.objectMatching-category-item';
    target.matches = selector => selector === '.objectMatching-option-item';
    const question = 'Blue marker', answer = 'A bright blue marker.';
    for (const [label,expected] of [[answer,false],['A '+answer,false],['J '+answer,true],['JJ '+answer,false]]) {
        target.textContent = label;
        assert.equal(env.helper.connectionConfirmed(source,target,question,answer),expected);
    }
});

test('Auto connects the remaining offscreen Synthetic token matching pair and then submits the ten-pair widget', async () => {
    const env = boot(), scope = node(), submit = node('Submit');
    const answers = [
        ['Blue marker','A bright blue marker.'],
        ['Silver token','A silver token from an invented set.'],
        ['Round token','A round token with a painted border.'],
        ['Square token','A square token with a smooth edge.'],
        ['Striped token','A striped token from the same invented set.'],
        ['Plain token','A plain token kept in a small box.'],
        ['Green token','A green token with a tiny dot.'],
        ['Red token','A red token beside the green token.'],
        ['Dotted token','A dotted token with a gold rim.'],
        ['Violet token','A violet token stored on a wooden shelf.']
    ];
    const controls = [], leaves = [];
    let remaining;
    answers.forEach(([question,answer],index) => {
        const letter = String.fromCharCode(65+index);
        const source = node(question+' '+letter), target = node(index ? letter+' '+answer : answer);
        source.matches = selector => selector === '.objectMatching-category-item';
        target.matches = selector => selector === '.objectMatching-option-item';
        source.parentNode = target.parentNode = scope;
        for (const [text,control] of [[question,source],[answer,target]]) {
            const leaf = node(text);
            leaf.closest = selector => selector === '[data-na-answers]' ? null : control;
            leaves.push(leaf);
        }
        if (!index) {
            let top = 2000;
            target.getBoundingClientRect = () => ({top,bottom:top+100,left:10,right:200});
            target.scrollIntoView = () => { top = 10; };
            target.click = () => { target.clicks++; target.textContent = letter+' '+answer; submit.disabled = false; };
            remaining = {source,target};
        }
        controls.push(source,target);
    });
    submit.disabled = true;
    submit.click = () => { submit.clicks++; scope.matches = selector => selector.startsWith('.is-complete'); };
    scope.children.set(controlSelector,controls);
    scope.children.set('*',leaves);
    scope.children.set('.js-btn-submit,button[type=submit],[data-action=submit]',[submit]);
    env.document.querySelector = () => scope;
    env.helper.components.set('synthetic-token-matching',{_id:'synthetic-token-matching',_component:'objectMatching',
        _items:answers.map(([question,answer]) => ({question,answer}))});
    env.helper.getPreferences().paced = false; env.helper.getPreferences().submit = true;
    await env.helper.runAutoOnce();
    assert.equal(remaining.source.clicks,1);
    assert.equal(remaining.target.clicks,1);
    assert.equal(submit.clicks,1);
    assert.equal(env.helper.isComplete(scope),true);
});

function syntheticFeatureMatching() {
    const env = boot(), scope = node(), submit = node('Submit');
    const pairs = [
        ['Map panel','Shows paths through an imaginary garden.'],
        ['A','The amber flag in this invented puzzle.'],
        ['Moon panel','Displays the fictional moon garden.'],
        ['Sun panel','Displays the fictional sun garden.'],
        ['Star panel','Displays a made-up star map.'],
        ['tile.ext','A fictional tile file.'],
        ['Cloud panel','Displays a fictional cloud collection.']
    ];
    let selected = null;
    const assigned = new Set(), sources = [], targets = [], leaves = [];
    pairs.forEach(([question,answer],index) => {
        const letter = String.fromCharCode(65+index), source = node(question+' '+letter), target = node(answer);
        source.matches = selector => selector === '.objectMatching-category-item';
        target.matches = selector => selector === '.objectMatching-option-item';
        source.parentNode = target.parentNode = scope;
        for (const control of [source,target]) {
            let top = 2000;
            control.getBoundingClientRect = () => ({top,bottom:top+60,left:10,right:200});
            control.scrollIntoView = () => { top = 10; };
        }
        source.click = () => { source.clicks++; selected = index; };
        target.click = () => {
            target.clicks++;
            assert.equal(selected,index);
            target.textContent = letter+' '+answer;
            assigned.add(index); submit.disabled = assigned.size !== pairs.length;
        };
        // Multiple "A" leaves in the simulated DOM: feature text and a different row's badge.
        for (const [text,parent] of [[question,source],[letter,source],[answer,target]]) {
            const leaf = node(text);
            leaf.closest = selector => selector === '[data-na-answers]' ? null : parent;
            leaves.push(leaf);
        }
        sources.push(source); targets.push(target);
    });
    scope.children.set('.objectMatching-category-item',sources);
    scope.children.set('.objectMatching-option-item',targets);
    scope.children.set(controlSelector,[...sources,...targets]);
    scope.children.set('*',leaves);
    submit.disabled = true;
    submit.click = () => { submit.clicks++; scope.matches = selector => selector.startsWith('.is-complete'); };
    scope.children.set('.js-btn-submit,button[type=submit],[data-action=submit]',[submit]);
    env.document.querySelector = () => scope;
    const component = {_id:'synthetic-features',_component:'objectMatching',_items:pairs.map(([question,answer]) => ({question,answer}))};
    env.helper.components.set(component._id,component);
    env.helper.getPreferences().paced = false; env.helper.getPreferences().submit = true;
    return {...env,scope,component,sources,targets,submit};
}

test('Synthetic feature matching resolves a literal A feature within its source column despite duplicate A badge leaves', () => {
    const env = syntheticFeatureMatching();
    const manual = env.helper.connectionActions(env.component,env.scope,false);
    assert.equal(manual.supported,true);
    assert.equal(manual.pending,true);
    assert.equal(manual.actions.length,0);
    const auto = env.helper.connectionActions(env.component,env.scope,true);
    assert.equal(auto.supported,true);
    assert.equal(auto.actions.length,14);
    assert.equal(auto.actions[2].node,env.sources[1]);
    assert.equal(auto.actions[3].node,env.targets[1]);
    const report = env.helper.debugReport().activities.find(activity => activity.id === 'synthetic-features');
    assert.equal(report.connections.reason,null);
    assert.ok(report.connections.pairs.every(pair => pair.sourceResolved && pair.answerResolved && !pair.confirmed));
});

test('Auto scrolls to the seven offscreen Synthetic feature matching pairs, connects them and submits', async () => {
    const env = syntheticFeatureMatching();
    await env.helper.runAutoOnce();
    assert.ok(env.sources.every(source => source.clicks === 1));
    assert.ok(env.targets.every(target => target.clicks === 1));
    assert.equal(env.submit.clicks,1);
    assert.equal(env.helper.isComplete(env.scope),true);
});

test('ambiguous literal A features remain blocked with a specific missing-source diagnostic', () => {
    const env = syntheticFeatureMatching(), duplicate = node('A C');
    env.sources.push(duplicate);
    const result = env.helper.connectionActions(env.component,env.scope,true);
    assert.equal(result.supported,false);
    assert.equal(result.actions.length,0);
    assert.match(result.reason,/connection 2 source: A$/);
});

test('paused final-second video resumes again after a previous play attempt without seeking repeatedly', () => {
    let clock = 0, plays = 0, seeks = 0, time = 0;
    const env = boot('[]',{performance:{now:() => clock}}), scope = node(), video = node();
    Object.assign(video,{paused:true,ended:false,seeking:false,duration:349,
        play:() => { plays++; /* Player remains paused while a seek settles. */ }});
    Object.defineProperty(video,'currentTime',{get:() => time,set:value => { time=value; seeks++; }});
    scope.children.set('video,audio',[video]);
    env.helper.mediaActions(scope).actions[0].apply();
    assert.equal(time,348);
    assert.equal(plays,1);
    assert.equal(env.helper.mediaActions(scope).actions.length,0);
    clock = 2000;
    let plan = env.helper.mediaActions(scope);
    assert.equal(plan.actions[0].label,'Resume video playback');
    plan.actions[0].apply();
    assert.equal(plays,2);
    assert.equal(seeks,1);
    clock = 6000;
    video.play = () => { plays++; video.paused=false; };
    env.helper.mediaActions(scope).actions[0].apply();
    assert.equal(plays,3);
    assert.equal(seeks,1);
    assert.equal(env.helper.mediaActions(scope).actions.length,0);
});

test('seeking must finish before Auto resumes a paused video', () => {
    const env = boot(), scope = node(), video = node();
    let plays = 0, time = 0;
    Object.assign(video,{paused:true,ended:false,seeking:false,duration:349,play:() => { plays++; }});
    Object.defineProperty(video,'currentTime',{get:() => time,set:value => { time=value; video.seeking=true; }});
    scope.children.set('video,audio',[video]);
    env.helper.mediaActions(scope).actions[0].apply();
    assert.equal(time,348);
    assert.equal(plays,0);
    assert.equal(env.helper.mediaActions(scope).actions.length,0);
    video.seeking = false;
    env.helper.mediaActions(scope).actions[0].apply();
    assert.equal(plays,1);
});

test('rejected and throwing play calls are retried with bounded backoff and retained diagnostics', async () => {
    let clock = 0, plays = 0;
    const env = boot('[]',{performance:{now:() => clock}}), scope = node(), video = node();
    Object.assign(video,{paused:true,ended:false,duration:349,currentTime:348,
        play:() => { plays++; return Promise.reject(Object.assign(Error('Gesture required'),{name:'NotAllowedError'})); }});
    scope.children.set('video,audio',[video]);
    env.helper.mediaActions(scope).actions[0].apply();
    await Promise.resolve();
    assert.equal(plays,1);
    assert.match(env.helper.mediaActions(scope).reason,/blocked/);
    assert.equal(env.helper.mediaActions(scope).actions.length,0);
    clock = 2000;
    env.helper.mediaActions(scope).actions[0].apply();
    await Promise.resolve();
    assert.equal(plays,2);
    video.play = () => { plays++; throw Error('Temporary player error'); };
    clock = 6000;
    env.helper.mediaActions(scope).actions[0].apply();
    assert.equal(plays,3);
    assert.equal(env.helper.mediaActions(scope).actions.length,0);
    env.document.querySelector = () => scope;
    env.helper.components.set('media',{_id:'media',_component:'media'});
    const media = env.helper.debugReport().activities.find(activity => activity.id === 'media').media[0];
    assert.equal(media.currentTime,348);
    assert.equal(media.playback.attempts,3);
    assert.match(media.playback.lastError,/Temporary player error/);
});

test('an unresolved play promise can recover after timeout without issuing a play call every tick', () => {
    let clock = 0, plays = 0;
    const env = boot('[]',{performance:{now:() => clock}}), scope = node(), video = node();
    Object.assign(video,{paused:true,ended:false,duration:349,currentTime:348,
        play:() => { plays++; return new Promise(() => {}); }});
    scope.children.set('video,audio',[video]);
    env.helper.mediaActions(scope).actions[0].apply();
    clock = 5000;
    assert.equal(env.helper.mediaActions(scope).actions.length,0);
    clock = 10000;
    env.helper.mediaActions(scope).actions[0].apply();
    assert.equal(plays,2);
    video.ended = true;
    clock = 50000;
    assert.equal(env.helper.mediaActions(scope).actions.length,0);
    assert.equal(plays,2);
});

test('Auto recovers the reported 5:48 pause and advances only after genuine media completion', async () => {
    let clock = 0, plays = 0, complete = false;
    const env = boot('[]',{performance:{now:() => clock}}), scope = node(), video = node();
    const next = node('',{'aria-label':'Go To 11.5. Windows Networking'});
    next.className = 'moduleNavBtn--sFwjV next--3dfUb';
    const current = node('11.4. Command-Line Tools0 / 5'), target = node('11.5. Windows Networking0 / 6');
    Object.assign(video,{paused:true,ended:false,duration:349,currentTime:0,play:() => {
        plays++; if (plays > 1) video.paused = false;
    }});
    scope.children.set('video,audio',[video]);
    scope.matches = selector => complete && selector.startsWith('.is-complete');
    env.document.querySelector = () => scope;
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="submodule-button-"]' ? [current,target] : [];
    env.helper.components.set('cli-video',{_id:'cli-video',_component:'media',_setCompletionOn:'ended'});
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(video.currentTime,348);
    assert.equal(plays,1);
    assert.equal(next.clicks,0);
    clock = 2000;
    await env.helper.runAutoOnce();
    assert.equal(plays,2);
    assert.equal(video.paused,false);
    assert.equal(next.clicks,0);
    // Simulate the browser playing the final second and the course recording it.
    video.currentTime = 349; video.ended = true; video.paused = true; complete = true;
    current.textContent = '11.4. Command-Line Tools5 / 5';
    await env.helper.runAutoOnce();
    assert.equal(next.clicks,1);
    assert.equal(plays,2);
});

test('video retries remain bounded and stale actions do not play a detached player', () => {
    let clock = 0, plays = 0;
    const env = boot('[]',{performance:{now:() => clock}}), scope = node(), video = node();
    Object.assign(video,{paused:true,ended:false,duration:349,currentTime:348,play:() => { plays++; }});
    scope.children.set('video,audio',[video]);
    env.helper.mediaActions(scope).actions[0].apply();
    for (let i=0;i<10;i++) {
        clock += 30000;
        env.helper.mediaActions(scope).actions[0].apply();
        assert.equal(env.helper.mediaActions(scope).actions.length,0);
    }
    assert.equal(plays,11);
    clock += 30000;
    const action = env.helper.mediaActions(scope).actions[0];
    video.isConnected = false;
    action.apply();
    assert.equal(plays,11);
});

function duplicateChoiceQuestion() {
    const env = boot(), scope = node(), submit = node('Submit',{'aria-label':'submit'});
    const items = [
        {text:'tile4',_shouldBeSelected:false},
        {text:'tile$',_shouldBeSelected:false},
        {text:'t!le4',_shouldBeSelected:true},
        {text:'tile$',_shouldBeSelected:false}
    ];
    const inputs = items.map(() => ({type:'radio',checked:false,disabled:false,clicks:0}));
    const labels = items.map((item,index) => {
        const label = node(item.text,{'for':'duplicate-choice-'+index+'-input'});
        label.id = 'duplicate-choice-'+index+'-label'; label.control = inputs[index];
        inputs[index].click = () => {
            inputs[index].clicks++;
            inputs.forEach(input => { input.checked = false; });
            inputs[index].checked = true; submit.disabled = false;
        };
        return label;
    });
    scope.children.set(controlSelector,[labels[1],labels[3],labels[0],labels[2]]);
    env.document.querySelector = () => scope;
    // The assessment Submit lives outside the individual question widget.
    env.document.querySelectorAll = selector => selector === 'button,[role="button"]' ? [submit] : [];
    submit.disabled = true;
    submit.click = () => { submit.clicks++; scope.matches = selector => selector === '.is-submitted'; };
    const component = {_id:'duplicate-choice',_component:'mcq',_items:items};
    env.helper.components.set('duplicate-choice',component);
    env.helper.getPreferences().paced = false; env.helper.getPreferences().submit = true;
    return {...env,scope,component,labels,inputs,submit};
}

test('a submitted retained question is retired only after native numbered advancement or results', async () => {
    const env = duplicateChoiceQuestion(), q1 = node('Q1'), q2 = node('Q2'), result = node('Result Page');
    let results = [];
    q1.className = 'block-button active-block';
    const query = env.document.querySelectorAll;
    env.document.querySelectorAll = selector => selector === 'button.block-button' ? [q1,q2] :
        selector === 'button.review-screen-button.active-block' ? results : query(selector);
    env.submit.click = () => { env.submit.clicks++; }; // The old widget keeps enabled inputs.
    await env.helper.runAutoOnce();
    assert.equal(env.submit.clicks,1);
    assert.equal(env.helper.questionFinished(env.component,env.scope),false);
    q1.className = 'block-button'; q2.className = 'block-button active-block';
    assert.equal(env.helper.questionFinished(env.component,env.scope),true);
    const route = env.location.href;
    env.location.href = 'https://www.netacad.com/other-course';
    assert.equal(env.helper.questionFinished(env.component,env.scope),false);
    env.location.href = route; q2.className = 'block-button'; results = [result];
    assert.equal(env.helper.questionFinished(env.component,env.scope),true);
});

test('unsupported SMV choice diagnostics retain bounded interpretation text and the selection count', () => {
    const env = boot(), component = clone(secureQuestion.component), scope = node();
    component._selectable = 2;
    component._smvWiseScoring.outcomes.interpretvar = Array.from({length:35},() => ({interpret:'x'.repeat(2000)}));
    env.helper.components.set(component._id,component);
    env.document.querySelector = () => scope;
    const choices = env.helper.debugReport().activities[0].choices;
    assert.match(choices.reason,/selection metadata.*selectable: 2/);
    assert.equal(choices.selectionMetadata.selectable,2);
    assert.equal(choices.selectionMetadata.interpretations.length,30);
    assert.equal(choices.selectionMetadata.interpretations[0].length,1000);
});

test('duplicate tile$ distractors do not block the distinct answer in a shuffled radio question', () => {
    const env = duplicateChoiceQuestion();
    env.inputs[1].checked = true;
    const result = env.helper.choiceActions(env.component,env.scope,true);
    assert.equal(result.supported,true);
    assert.equal(result.actions.length,1);
    assert.equal(result.actions[0].node,env.labels[2]);
    result.actions[0].apply();
    assert.equal(env.inputs[2].checked,true);
    assert.equal(env.inputs[1].checked,false);
    assert.equal(env.helper.choiceActions(env.component,env.scope,true).actions.length,0);
});

test('Auto selects and submits the synthetic duplicate-choice question despite duplicate incorrect labels', async () => {
    const env = duplicateChoiceQuestion();
    await env.helper.runAutoOnce();
    assert.equal(env.inputs[2].clicks,1);
    assert.equal(env.inputs[1].clicks+env.inputs[3].clicks,0);
    assert.equal(env.submit.clicks,1);
    const report = env.helper.debugReport().activities.find(activity => activity.id === 'duplicate-choice');
    assert.equal(report.choices.reason,null);
    assert.equal(report.choices.controls.length,4);
});

test('Auto resolves escaped angle-bracket text exactly once and submits the shuffled question', async () => {
    const env = duplicateChoiceQuestion();
    const rendered = 'Show the <invented token> & keep this label literal.';
    const schema = '<p>Show the &lt;invented token&gt; &amp; keep this label literal.</p>';
    env.component._items[2].text = schema;
    env.labels[2].textContent = rendered;
    await env.helper.runAutoOnce();
    assert.equal(env.inputs[2].clicks,1);
    assert.equal(env.submit.clicks,1);
    assert.equal(env.component._items[2].text,schema);
});

test('choice lookup preserves entity-looking literal text after a single HTML decode', () => {
    const env = duplicateChoiceQuestion();
    env.component._items[2].text = 'Display &amp;lt;token&amp;gt; literally';
    env.labels[2].textContent = 'Display &lt;token&gt; literally';
    const result = env.helper.choiceActions(env.component,env.scope,true);
    assert.equal(result.supported,true);
    assert.equal(result.actions[0].node,env.labels[2]);
});

test('identical text with conflicting answer flags is blocked even if a separate answer is identifiable', () => {
    const env = duplicateChoiceQuestion();
    env.component._items[1]._shouldBeSelected = true;
    const result = env.helper.choiceActions(env.component,env.scope,true);
    assert.equal(result.supported,false);
    assert.equal(result.actions.length,0);
    assert.match(result.reason,/conflicting selection requirements: tile\$/);
});

test('duplicate incorrect checkbox choices are all cleared before selecting the correct checkbox', () => {
    const env = boot(), scope = node();
    const labels = ['Duplicate','Correct','Duplicate'].map(text => {
        const label = node(text);
        label.control = {type:'checkbox',checked:text === 'Duplicate',disabled:false,
            click() { this.checked = !this.checked; }};
        return label;
    });
    scope.children.set(controlSelector,labels);
    const component = {_component:'gmcq',_items:[
        {text:'Duplicate',_shouldBeSelected:false},{text:'Duplicate',_shouldBeSelected:false},
        {text:'Correct',_shouldBeSelected:true}]};
    const result = env.helper.choiceActions(component,scope,true);
    assert.equal(result.supported,true);
    assert.deepEqual(Array.from(result.actions,action => action.label),['Clear answer','Clear answer','Select answer']);
    result.actions.forEach(action => action.apply());
    assert.deepEqual(labels.map(label => label.control.checked),[false,true,false]);
});

function adobeAnimation(options = {}) {
    const env = boot('[]',options), scope = node(), button = node(), timeline = node();
    Object.assign(timeline,{value:'0',min:'0',max:'100'});
    scope.children.set('button,[role="button"]',[button]);
    scope.children.set(controlSelector,[button]);
    scope.children.set('input[type=range]',[timeline]);
    const component = {_id:'sample-animation',_component:'adobe-animate',_setCompletionOn:'webComponentEvent'};
    env.helper.components.set(component._id,component);
    env.document.querySelector = () => scope;
    return {...env,scope,button,timeline,component};
}

test('Adobe Animate recognizes the reported blank Play button and timeline, starts once and waits for real completion', () => {
    const env = adobeAnimation();
    let plan = env.helper.plan(env.component,env.scope,true);
    assert.equal(plan.supported,true);
    assert.equal(plan.actions[0].label,'Play animation');
    plan.actions[0].apply();
    assert.equal(env.button.clicks,1);
    assert.equal(env.timeline.value,'0');
    assert.equal(env.helper.plan(env.component,env.scope,true).actions.length,0);
    env.timeline.value = '50';
    assert.equal(env.helper.plan(env.component,env.scope,true).actions.length,0);
    env.timeline.value = '100';
    plan = env.helper.plan(env.component,env.scope,true);
    assert.equal(plan.waiting,true);
    assert.match(plan.reason,/waiting for course completion/);
    assert.equal(env.helper.isComplete(env.scope),false);
    assert.equal(env.button.clicks,1);
    const report = env.helper.debugReport().activities.find(activity => activity.id === 'sample-animation');
    assert.equal(report.animation.timelines[0].value,'100');
    assert.equal(report.animation.playback.clicks,1);
});

test('Auto plays the Sample Animation animation and advances only after the course marks it complete', async () => {
    const env = adobeAnimation(), next = node('',{'aria-label':'Go To 13.4. Sample Topic Four'});
    next.className = 'moduleNavBtn--sFwjV next--3dfUb';
    const current = node('13.3. Sample Topic Three5 / 6'), target = node('13.4. Sample Topic Four0 / 1');
    let top = 2000;
    env.button.getBoundingClientRect = () => ({top,bottom:top+30,left:10,right:50});
    env.button.scrollIntoView = () => { top = 10; };
    env.document.querySelectorAll = selector => selector === 'button,a[href],[role="button"]' ? [next] :
        selector === 'button[id^="submodule-button-"]' ? [current,target] : [];
    env.helper.getPreferences().paced = false;
    await env.helper.runAutoOnce();
    assert.equal(env.button.clicks,1);
    assert.equal(next.clicks,0);
    env.timeline.value = '100';
    await env.helper.runAutoOnce();
    assert.equal(env.button.clicks,1);
    assert.equal(next.clicks,0);
    env.scope.matches = selector => selector.startsWith('.is-complete');
    current.textContent = '13.3. Sample Topic Three6 / 6';
    await env.helper.runAutoOnce();
    assert.equal(next.clicks,1);
});

test('animation playback is not toggled if progress begins during the action delay', () => {
    const env = adobeAnimation();
    const action = env.helper.plan(env.component,env.scope,true).actions[0];
    env.timeline.value = '10';
    action.apply();
    assert.equal(env.button.clicks,0);
    assert.equal(env.helper.plan(env.component,env.scope,true).actions.length,0);
});

test('named animation Play can resume after a stall while blank toggles are not repeatedly clicked', () => {
    let clock = 0;
    const env = adobeAnimation({performance:{now:() => clock}});
    env.helper.plan(env.component,env.scope,true).actions[0].apply();
    clock = 20000;
    let plan = env.helper.plan(env.component,env.scope,true);
    assert.equal(plan.actions.length,0);
    assert.match(plan.reason,/has not advanced/);
    env.button.setAttribute('aria-label','Play');
    plan = env.helper.plan(env.component,env.scope,true);
    assert.equal(plan.actions[0].label,'Resume animation');
    plan.actions[0].apply();
    assert.equal(env.button.clicks,2);
    env.button.setAttribute('aria-label','Pause');
    clock = 40000;
    assert.equal(env.helper.plan(env.component,env.scope,true).actions.length,0);
});

test('animation detection refuses ambiguous controls and ignores completed widgets', () => {
    const env = adobeAnimation();
    env.scope.children.set('button,[role="button"]',[env.button,node()]);
    assert.equal(env.helper.plan(env.component,env.scope,true).supported,false);
    env.scope.children.set('button,[role="button"]',[env.button]);
    env.scope.children.set('input[type=range]',[env.timeline,node()]);
    assert.equal(env.helper.plan(env.component,env.scope,true).supported,false);
    env.scope.matches = selector => selector.startsWith('.is-complete');
    assert.equal(env.helper.plan(env.component,env.scope,true).actions.length,0);
    assert.equal(env.helper.plan(env.component,env.scope,false),null);
});

test('Auto scrolls an assessment Start below a visible intro heading into view and starts it', async () => {
    const env = boot(), scope = node(), start = node('Start', {role:'button'});
    let top = 2000, scrolled = 0;
    start.getBoundingClientRect = () => ({top,bottom:top+40,left:10,right:200});
    start.scrollIntoView = () => { scrolled++; top=100; };
    scope.children.set(controlSelector,[start]);
    env.document.querySelector = () => scope;
    env.helper.components.set('security-intro',{_id:'security-intro',_component:'adaptiveStartScreen'});
    env.helper.getPreferences().paced = false; env.helper.getPreferences().submit = true;
    const plan = env.helper.plan(env.helper.components.get('security-intro'),scope,true);
    assert.equal(plan.supported,true);
    assert.equal(plan.actions[0].node,start);
    await env.helper.runAutoOnce();
    assert.equal(scrolled,1);
    assert.equal(start.clicks,1);
});

test('assessment Start retries a click that left the intro open, but stops once questions appear', () => {
    let clock = 0;
    const env = boot('[]',{performance:{now:() => clock}}), scope = node(), start = node('Start');
    const component = {_component:'adaptiveStartScreen'};
    scope.children.set(controlSelector,[start]);
    env.helper.getPreferences().submit = true;
    env.helper.plan(component,scope,true).actions[0].apply();
    assert.equal(start.clicks,1);
    assert.equal(env.helper.plan(component,scope,true).actions.length,0);
    clock = 10000;
    env.helper.plan(component,scope,true).actions[0].apply();
    assert.equal(start.clicks,2);
    clock = 30000;
    const action = env.helper.plan(component,scope,true).actions[0];
    env.document.querySelectorAll = selector => selector === 'button.block-button[aria-label]' ?
        [node('Q1',{'aria-label':'selected Question 1'})] : [];
    action.apply();
    assert.equal(start.clicks,2);
    assert.equal(env.helper.activityFinished(component,scope),true);
});

test('a second offscreen Start prevents an ambiguous intro click', () => {
    const env = boot(), scope = node(), first = node('Start'), second = node('Start');
    second.getBoundingClientRect = () => ({top:2000,bottom:2040,left:10,right:200});
    scope.children.set(controlSelector,[first,second]);
    env.helper.getPreferences().submit = true;
    const plan = env.helper.plan({_component:'adaptiveStartScreen'},scope,true);
    assert.equal(plan.supported,false);
    assert.match(plan.reason,/No unique enabled assessment Start/);
    assert.equal(first.clicks+second.clicks,0);
});
