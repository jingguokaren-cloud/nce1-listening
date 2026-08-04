(() => {
  "use strict";
  const KEY = "nce1-listening-v1";
  const AUDIO_REVISION = "20260804-manual-audit-26";
  const TOTAL = LISTENING_DATA.reduce((n,l)=>n+l.parts.reduce((m,p)=>m+p.questions.length,0),0);
  const byId = new Map();
  LISTENING_DATA.forEach(l=>l.parts.forEach(p=>p.questions.forEach(q=>byId.set(q.id,{lesson:l,part:p,q}))));
  let state = load();
  let lessonIndex = Math.max(0, LISTENING_DATA.findIndex(l=>l.id===state.lesson));
  let view = "practice";
  const persistentAudio = new Audio();
  let activeAudioSrc = "";
  let activePlayButton = null;
  const app = document.querySelector("#app");
  const lessonSelect = document.querySelector("#lessonSelect");
  const rateSelect = document.querySelector("#rateSelect");

  function load(){try{return Object.assign({lesson:"l001-002",answers:{},checked:{},wrong:{},stars:{},rate:1},JSON.parse(localStorage.getItem(KEY)||"{}"))}catch{return {lesson:"l001-002",answers:{},checked:{},wrong:{},stars:{},rate:1}}}
  function save(){localStorage.setItem(KEY,JSON.stringify(state));updateProgress()}
  function esc(s=""){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
  function rich(s=""){
    let safe=esc(s);
    safe=safe.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,'<img src="$2" alt="$1" loading="lazy">');
    safe=safe.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
    return safe.replace(/\n/g,"<br>");
  }
  function answerLetter(answer){const m=answer.match(/^([A-G])(?:（|\s|$)/);return m?m[1]:null}
  function isTF(answer){const m=answer.match(/^([TF])(?:（(?:正确|错误)）|\s+(?:true|false)|$)/i);return m?m[1].toUpperCase():null}
  function inferredLetters(context){const found=[...context.matchAll(/(?:^|\n)\s*([A-G])\.\s*/g)].map(m=>m[1]);return [...new Set(found)]}
  function normalized(s){return String(s||"").trim().toLowerCase().replace(/[\s.,!?;:'"“”‘’()（）-]+/g,"")}
  function correctValue(q){return answerLetter(q.answer)||isTF(q.answer)||q.answer}
  function selectedValue(q){return state.answers[q.id]??""}
  function isCorrect(q){
    const selected=normalized(selectedValue(q));
    const expected=correctValue(q);
    const accepted=(answerLetter(q.answer)||isTF(q.answer))?[expected]:String(expected).split(/[\/；;]/);
    return accepted.some(value=>selected===normalized(value));
  }

  function choices(q,part){
    if(q.options.length)return q.options.map((text,i)=>({value:String.fromCharCode(65+i),label:text}));
    const tf=isTF(q.answer);if(tf)return [{value:"T",label:"正确"},{value:"F",label:"错误"}];
    if(answerLetter(q.answer)){
      const letters=inferredLetters(part.context);
      return (letters.length?letters:["A","B","C"]).map(letter=>({value:letter,label:`选项 ${letter}`}));
    }
    return [];
  }
  function audioPlayerHTML(src,label,ariaLabel){
    return `<div class="audio-wrap"><button class="play-btn" data-play data-audio-src="${esc(`${src}?v=${AUDIO_REVISION}`)}" aria-label="${ariaLabel}" tabindex="0">▶</button><span class="audio-status">${label}</span></div>`;
  }
  function questionHTML(q,part,showAudio=true){
    const list=choices(q,part),selected=selectedValue(q),checked=!!state.checked[q.id],correct=isCorrect(q);
    const options=list.length?`<div class="options">${list.map(o=>{
      const c=checked?(o.value===correctValue(q)?" correct-answer":o.value===selected&&!correct?" wrong-answer":""):o.value===selected?" selected":"";
      return `<button class="option${c}" data-choice="${o.value}" ${checked?"disabled":""}><span class="choice-letter">${o.value}</span>${rich(o.label)}</button>`
    }).join("")}</div>`:`<input class="text-answer" data-input value="${esc(selected)}" placeholder="请输入答案" ${checked?"readonly":""}>`;
    const checkAction=list.length||checked?"":'<button class="check-btn" data-check tabindex="-1">核对答案</button>';
    return `<article class="question${checked?` checked ${correct?"correct":"wrong"}`:""}" data-id="${q.id}">
      <div class="question-top"><span class="q-number">${q.number}.</span>${showAudio?audioPlayerHTML(q.audio,"点击播放 · 原录音（含序号）",`播放第 ${q.number} 题原录音`):""}<button class="star-btn${state.stars[q.id]?" starred":""}" data-star aria-label="收藏此题">★</button></div>
      <div class="prompt">${rich(q.prompt)}</div>${options}
      <div class="actions">${checkAction}<button class="soft-btn" data-reset-question${list.length?"":' tabindex="-1"'}>重置本题</button><button class="soft-btn" data-answer${list.length?"":' tabindex="-1"'}>显示答案</button>${list.length?"":'<span class="shortcut-hint">Enter 核对 · Tab 下一题播放键</span>'}${checked?`<span class="feedback ${correct?"ok":"bad"}">${correct?"回答正确":"再听一次试试"}</span>`:""}</div>
      <div class="answer-box" data-answer-box hidden>答案：${rich(q.answer)}</div>
    </article>`;
  }
  function clozeBlankHTML(q){
    const selected=selectedValue(q),checked=!!state.checked[q.id],correct=isCorrect(q);
    const [before="",after=""] = q.prompt.split("____");
    return `${rich(before)}<span class="question cloze-blank${checked?` checked ${correct?"correct":"wrong"}`:""}" data-id="${q.id}"><label><span class="cloze-number">${q.number}</span><input class="text-answer cloze-input" data-input value="${esc(selected)}" placeholder="填写第 ${q.number} 空" aria-label="第 ${q.number} 空" ${checked?"readonly":""}></label><span class="actions cloze-actions">${checked?"":'<button class="check-btn" data-check tabindex="-1">核对</button>'}<button class="soft-btn" data-reset-question tabindex="-1">重置</button><button class="soft-btn" data-answer tabindex="-1">答案</button>${checked?`<span class="feedback ${correct?"ok":"bad"}">${correct?"正确":"再听一次"}</span>`:""}</span><span class="answer-box" data-answer-box hidden>答案：${rich(q.answer)}</span></span>${rich(after)}`;
  }
  function clozeGroupHTML(part,questions){
    const first=questions[0];
    if(!first?.audioGroup||!questions.every(q=>q.audioGroup===first.audioGroup&&!q.options.length&&q.prompt.includes("____")))return "";
    return `<section class="shared-audio-group cloze-group"><div class="shared-audio-head"><span class="shared-audio-badge">共用录音</span>${audioPlayerHTML(first.groupAudio,`${first.groupLabel} · 原录音`,`播放${first.groupLabel}原录音`)}</div><div class="cloze-dialogue">${questions.map(clozeBlankHTML).join("\n")}</div></section>`;
  }
  function questionsHTML(part,questions){
    if(part.cloze&&questions.length>1){
      const cloze=clozeGroupHTML(part,questions);
      if(cloze)return cloze;
    }
    const output=[];
    for(let index=0;index<questions.length;){
      const question=questions[index];
      if(!question.audioGroup){
        output.push(questionHTML(question,part));
        index+=1;
        continue;
      }
      const grouped=[];
      while(index<questions.length&&questions[index].audioGroup===question.audioGroup){
        grouped.push(questions[index]);
        index+=1;
      }
      output.push(`<section class="shared-audio-group"><div class="shared-audio-head"><span class="shared-audio-badge">共用录音</span>${audioPlayerHTML(question.groupAudio,`${question.groupLabel} · 原录音`,`播放${question.groupLabel}原录音`)}</div><div class="shared-questions">${grouped.map(item=>questionHTML(item,part,false)).join("")}</div></section>`);
    }
    return output.join("");
  }
  function hasImageChoices(part){return /!\[[^\]]*\]\([^)]+\)/.test(part.context)}
  function imageChoiceHTML(context){
    const pattern=/(?:^|\n)\s*([A-G])\.\s*([\s\S]*?)(?=\n\s*[A-G]\.\s*|$)/g;
    const choices=[...context.matchAll(pattern)];
    if(!choices.length)return `<div class="context">${rich(context)}</div>`;
    return `<div class="image-choice-list">${choices.map(match=>`<figure class="image-choice-card"><figcaption>${match[1]}</figcaption><div>${rich(match[2].trim())}</div></figure>`).join("")}</div>`;
  }
  function partExerciseHTML(part,questions=part.questions){
    const questionList=`<div class="questions">${questionsHTML(part,questions)}</div>`;
    if(hasImageChoices(part)){
      return `<div class="image-choice-layout"><aside class="image-choice-panel" aria-label="图片选项"><p class="image-choice-hint">图片选项</p>${imageChoiceHTML(part.context)}</aside>${questionList}</div>`;
    }
    return `${part.context?`<div class="context">${rich(part.context)}</div>`:""}${questionList}`;
  }
  function partHTML(part){return `<section class="part-card${hasImageChoices(part)?" image-part":""}"><h3 class="part-title"><span class="roman">${part.roman}</span><span class="part-title-text">${rich(part.title)}</span><button class="reset-part-btn" data-reset-part="${part.roman}">重置本大题</button></h3>${partExerciseHTML(part)}${part.transcript?`<details class="transcript"><summary>查看本大题听力原文</summary><div class="transcript-body">${rich(part.transcript)}</div></details>`:""}</section>`}
  function renderPractice(){const l=LISTENING_DATA[lessonIndex];app.innerHTML=`<div class="lesson-head"><h2>${l.label}</h2><div class="lesson-nav"><button class="reset-lesson-btn" data-reset-lesson>重置本课</button><button class="icon-btn" data-prev ${lessonIndex===0?"disabled":""} aria-label="上一课">←</button><button class="icon-btn" data-next ${lessonIndex===LISTENING_DATA.length-1?"disabled":""} aria-label="下一课">→</button></div></div>${l.parts.map(partHTML).join("")}`;bindQuestions()}
  function renderMistakes(){const items=Object.keys(state.wrong).filter(id=>state.wrong[id]&&byId.has(id));app.innerHTML=items.length?`<div class="lesson-head"><h2>错题本</h2><span>${items.length} 题</span></div>${items.map(id=>{const x=byId.get(id);return `<section class="part-card${hasImageChoices(x.part)?" image-part":""}"><h3 class="part-title"><span class="roman">${x.part.roman}</span>${x.lesson.label} · ${rich(x.part.title)}</h3>${partExerciseHTML(x.part,[x.q])}</section>`}).join("")}`:`<div class="empty"><h2>暂时没有错题</h2><p>答错的题目会自动收录到这里。</p></div>`;bindQuestions()}
  function render(){view==="practice"?renderPractice():renderMistakes();updateProgress()}
  function bindQuestions(){
    app.querySelectorAll("[data-play]").forEach(btn=>btn.onclick=()=>{
      play(btn);
      btn.closest(".question")?.querySelector("[data-input]")?.focus();
    });
    app.querySelectorAll("[data-choice]").forEach(btn=>btn.onclick=()=>selectAndCheck(btn));
    app.querySelectorAll("[data-input]").forEach(input=>{
      input.oninput=()=>{state.answers[input.closest(".question").dataset.id]=input.value;save()};
      input.onkeydown=handleInputKeydown;
    });
    app.querySelectorAll("[data-check]").forEach(btn=>btn.onclick=()=>check(btn));
    app.querySelectorAll("[data-reset-question]").forEach(btn=>btn.onclick=()=>resetQuestion(btn.closest(".question").dataset.id));
    app.querySelectorAll("[data-reset-part]").forEach(btn=>btn.onclick=()=>resetPart(btn.dataset.resetPart));
    app.querySelectorAll("[data-answer]").forEach(btn=>btn.onclick=()=>{const box=btn.closest(".question").querySelector("[data-answer-box]");box.hidden=!box.hidden;btn.textContent=box.hidden?"显示答案":"隐藏答案"});
    app.querySelectorAll("[data-star]").forEach(btn=>btn.onclick=()=>{const id=btn.closest(".question").dataset.id;state.stars[id]=!state.stars[id];save();btn.classList.toggle("starred",state.stars[id])});
    app.querySelector("[data-prev]")?.addEventListener("click",()=>goLesson(lessonIndex-1));app.querySelector("[data-next]")?.addEventListener("click",()=>goLesson(lessonIndex+1));
    app.querySelector("[data-reset-lesson]")?.addEventListener("click",resetLesson);
    syncActivePlayButton();
  }
  function selectAndCheck(btn){
    const card=btn.closest(".question");
    const id=card.dataset.id;
    const question=byId.get(id).q;
    state.answers[id]=btn.dataset.choice;
    state.checked[id]=true;
    const correct=isCorrect(question);
    state.wrong[id]=!correct;
    save();
    card.classList.add("checked",correct?"correct":"wrong");
    card.querySelectorAll("[data-choice]").forEach(option=>{
      option.disabled=true;
      option.classList.remove("selected");
      if(option.dataset.choice===correctValue(question))option.classList.add("correct-answer");
      if(option===btn&&!correct)option.classList.add("wrong-answer");
    });
    const actions=card.querySelector(".actions");
    actions.querySelector(".feedback")?.remove();
    actions.insertAdjacentHTML("beforeend",`<span class="feedback ${correct?"ok":"bad"}">${correct?"回答正确":"再听一次试试"}</span>`);
  }
  function clearQuestionState(id){delete state.answers[id];delete state.checked[id];delete state.wrong[id]}
  function resetQuestion(id){clearQuestionState(id);save();render()}
  function resetPart(roman){
    const part=LISTENING_DATA[lessonIndex].parts.find(item=>item.roman===roman);
    if(!part||!confirm(`确定重置大题 ${roman} 的全部作答记录吗？`))return;
    part.questions.forEach(question=>clearQuestionState(question.id));
    stopAudio();
    save();
    render();
  }
  function resetLesson(){
    const lesson=LISTENING_DATA[lessonIndex];
    if(!confirm(`确定重置 ${lesson.label} 的全部作答记录吗？`))return;
    lesson.parts.forEach(part=>part.questions.forEach(question=>clearQuestionState(question.id)));
    stopAudio();
    save();
    render();
  }
  function resetPlayButtons(){document.querySelectorAll(".play-btn.playing").forEach(button=>{button.classList.remove("playing");button.textContent="▶"})}
  function syncActivePlayButton(){
    resetPlayButtons();
    if(!activeAudioSrc||persistentAudio.paused)return;
    activePlayButton=[...document.querySelectorAll("[data-play]")].find(button=>button.dataset.audioSrc===activeAudioSrc)||null;
    if(activePlayButton){activePlayButton.classList.add("playing");activePlayButton.textContent="❚❚"}
  }
  function stopAudio(){persistentAudio.pause();persistentAudio.currentTime=0;activeAudioSrc="";activePlayButton=null;resetPlayButtons()}
  function play(btn){
    const src=btn.dataset.audioSrc;
    if(activeAudioSrc===src&&!persistentAudio.paused){persistentAudio.pause();syncActivePlayButton();return}
    if(activeAudioSrc!==src){persistentAudio.pause();persistentAudio.currentTime=0;persistentAudio.src=src;activeAudioSrc=src}
    persistentAudio.playbackRate=Number(state.rate)||1;
    persistentAudio.play().then(()=>{activePlayButton=btn;syncActivePlayButton()}).catch(()=>{btn.nextElementSibling.textContent="音频加载失败"});
  }
  persistentAudio.addEventListener("ended",()=>{activeAudioSrc="";activePlayButton=null;resetPlayButtons()});
  function gradeTextQuestion(card){
    const id=card.dataset.id,q=byId.get(id).q,input=card.querySelector("[data-input]");
    state.answers[id]=input.value;
    if(!input.value.trim()){
      card.querySelector(".feedback")?.remove();
      card.querySelector(".actions").insertAdjacentHTML("beforeend",'<span class="feedback bad">请先作答</span>');
      return false;
    }
    state.checked[id]=true;state.wrong[id]=!isCorrect(q);save();
    const correct=isCorrect(q);
    card.classList.add("checked",correct?"correct":"wrong");
    input.readOnly=true;
    card.querySelector("[data-check]")?.remove();
    card.querySelector(".feedback")?.remove();
    card.querySelector(".actions").insertAdjacentHTML("beforeend",`<span class="feedback ${correct?"ok":"bad"}">${correct?"回答正确":"再听一次试试"}</span>`);
    input.focus();
    return true;
  }
  function handleInputKeydown(event){
    const card=event.currentTarget.closest(".question");
    if(event.key==="Enter"){
      event.preventDefault();
      if(!state.checked[card.dataset.id])gradeTextQuestion(card);
    }
  }
  function check(btn){gradeTextQuestion(btn.closest(".question"))}
  function goLesson(index){stopAudio();lessonIndex=Math.max(0,Math.min(index,LISTENING_DATA.length-1));state.lesson=LISTENING_DATA[lessonIndex].id;lessonSelect.value=state.lesson;save();render();scrollTo({top:document.querySelector(".toolbar").offsetTop,behavior:"smooth"})}
  function updateProgress(){const done=Object.keys(state.checked).filter(id=>state.checked[id]).length;document.querySelector("#progressText").textContent=`${done} / ${TOTAL}`;document.querySelector("#progressBar").style.width=`${done/TOTAL*100}%`;document.querySelector("#mistakeCount").textContent=Object.values(state.wrong).filter(Boolean).length}

  LISTENING_DATA.forEach(l=>lessonSelect.add(new Option(l.label,l.id)));
  lessonSelect.value=LISTENING_DATA[lessonIndex].id;lessonSelect.onchange=()=>goLesson(LISTENING_DATA.findIndex(l=>l.id===lessonSelect.value));
  rateSelect.value=String(state.rate);rateSelect.onchange=()=>{state.rate=Number(rateSelect.value);persistentAudio.playbackRate=state.rate;save()};
  document.querySelectorAll(".tab").forEach(tab=>tab.onclick=()=>{stopAudio();view=tab.dataset.view;document.querySelectorAll(".tab").forEach(x=>{x.classList.toggle("active",x===tab);x.setAttribute("aria-selected",String(x===tab))});render()});
  render();
})();
