(() => {
  "use strict";

  const ROWS = 4, COLS = 5;
  const DIRS = ["N","E","S","W"];
  const VEC = { N:[-1,0], E:[0,1], S:[1,0], W:[0,-1] };
  const STORAGE_KEY = "track_5x4";


  const PRESET_TRACKS = [
    [
      [0,0,0,0,0],
      [0,0,0,0,0],
      [0,0,0,0,0],
      [1,1,1,1,1],
    ],
    [
      [1,1,1,1,1],
      [0,0,0,0,1],
      [1,1,1,1,1],
      [1,0,0,0,0],
    ],
    [
      [0,0,0,0,0],
      [0,0,1,0,0],
      [1,1,1,0,0],
      [1,0,0,0,0],  
    ],
  ].map(m => m.map(row => row.map(Boolean)));

  
  let configure = false;
  let track = Array.from({length:ROWS},()=>Array(COLS).fill(false));
  let robot = { r: ROWS-1, c: 0, dir: "E" };
  let moves = [];
  let timer = null;

  const $ = (s)=>document.querySelector(s);
  const grid = $("#grid");
  const movesEl = $("#moves");
  const statusEl = $("#status");
  const controlsEl = $("#controls");

  const btnExec = $("#btn-exec");
  const btnReset = $("#btn-reset");
  const btnConf  = $("#btn-conf");
  const btnSave  = $("#btn-save");

  const modalEl   = $("#modal");
  const modalTitle= $("#modal-title");
  const modalMsg  = $("#modal-msg");
  const modalClose= $("#modal-close");

  const robotImg = new Image();
  robotImg.src = "img/robot.png";
  robotImg.alt = "Robot";
  robotImg.className = "robot";
  const cellAt = (r,c)=> grid.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  const ANG = { N:-90, E:0, S:90, W:180 };
  function spriteTo(r,c,dir){
    const host = cellAt(r,c);
    if(!host) return;
    host.appendChild(robotImg);
    robotImg.style.transform = `translate(-50%,-50%) rotate(${ANG[dir]}deg)`;
  }


  attachEvents();
  loadRandomTrack();
  placeRobot();
  writeStatus("Selecciona movimientos y pulsa Ejecutar.");

  
  function attachEvents(){
    
    grid.addEventListener("click", onGridClick);

    controlsEl.addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-move]");
      if(!btn || btn.disabled) return;
      const m = btn.getAttribute("data-move");
      addMove(m);
    });

    btnExec.addEventListener("click", runProgram);

    btnReset.addEventListener("click", resetAll);

    btnConf.addEventListener("click", toggleConfigure);

    btnSave.addEventListener("click", saveTrack);

    modalClose.addEventListener("click", hideModal);
    modalEl.querySelector(".modal__backdrop").addEventListener("click", hideModal);
    document.addEventListener("keydown", (e)=>{ if(e.key === "Escape") hideModal(); });
  }

  function loadRandomTrack(){
    const saved = readSavedTrack();
    const pool = saved ? [saved, ...PRESET_TRACKS] : PRESET_TRACKS;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    track = cloneMatrix(pick);
    renderTrack();
    robot = { r: ROWS-1, c: 0, dir: "E" };
    placeRobot();
  }

  function readSavedTrack(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const mat = JSON.parse(raw);
      if(!Array.isArray(mat) || mat.length!==ROWS) return null;
      return mat.map(row => row.map(Boolean));
    }catch{ return null; }
  }

  function saveTrack(){
    if(!configure){
      writeStatus("Primero entra a Configurar.", true);
      return;
    }
    if(!hasPath()){
      writeStatus("Dibuja al menos una celda de pista.", true);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(track));
    writeStatus("¡Pista guardada! Ahora participa en la selección aleatoria.");
    configure = false;
    btnConf.setAttribute("aria-pressed","false");
    btnSave.hidden = true;
    grid.classList.remove("configuring");
    loadRandomTrack();
  }

  function renderTrack(){
    const cells = grid.querySelectorAll(".cell");
    cells.forEach((cell)=>{
      const r = parseInt(cell.dataset.r,10);
      const c = parseInt(cell.dataset.c,10);
      cell.classList.toggle("green", !!track[r][c]);
      cell.classList.toggle("start",  r===ROWS-1 && c===0);
    });
  }

  function placeRobot(){
    renderTrack();
    spriteTo(robot.r, robot.c, robot.dir);
  }

  function onGridClick(e){
    if(!configure) return;
    const cell = e.target.closest(".cell");
    if(!cell) return;
    const r = parseInt(cell.dataset.r,10);
    const c = parseInt(cell.dataset.c,10);
    track[r][c] = !track[r][c];
    cell.classList.toggle("green", track[r][c]);
  }

  function toggleConfigure(){
    configure = !configure;
    btnConf.setAttribute("aria-pressed", String(configure));
    btnSave.hidden = !configure;
    grid.classList.toggle("configuring", configure);
    writeStatus(configure ? "Modo Configurar: haz clic para pintar/quitar celdas. Guarda para aplicar."
                          : "Modo juego: agrega movimientos y ejecuta.");
  }

  function addMove(m){
    moves.push(m);
    const li = document.createElement("li");
    li.textContent = label(m);
    li.dataset.move = m;
    movesEl.appendChild(li);
  }
  function clearMoves(){
    moves = [];
    movesEl.innerHTML = "";
  }

  function runProgram(){
    if(timer) return;
    if(!hasPath()){
      writeStatus("No hay pista. Configura y guarda una, o usa las predefinidas.", true);
      return;
    }
    if(moves.length === 0){
      writeStatus("Agrega movimientos antes de ejecutar.", true);
      return;
    }
    
    const startR = ROWS-1, startC = 0;
    if(!onPath(startR,startC)){
      writeStatus("La celda inicial no está en la pista. Píntala en Configurar.", true);
      return;
    }
    
    const openCount = moves.filter(m=>m==="B").length;
    if(openCount % 2 !== 0){
      writeStatus("El bucle B debe cerrarse con otro B (pares).", true);
      return;
    }
    const program = expandLoops(moves);
    if(program.length === 0){
      writeStatus("El programa está vacío tras expandir. Agrega movimientos.", true);
      return;
    }

    setRunning(true);

    let r = startR, c = startC, dir = "E";
    const farGoal = farthestReachable(track, startR, startC);
    const items = Array.from(movesEl.children);
    let pi = 0;
    let mi = 0;
    const stepMap = buildStepMap(moves);

    highlightMove(items, mi);
    spriteTo(r,c,dir);

    timer = setInterval(()=>{
      if(pi >= program.length){
        clearInterval(timer); timer = null;
        setRunning(false);
        
        if(farGoal && r===farGoal.r && c===farGoal.c){
          writeStatus("Misión satisfactoria");
          showModal("success","¡Felicitaciones!","Misión cumplida");
        }else{
          writeStatus("Inténtalo de nuevo (no llegaste a la meta)", true);
          showModal("error","Casi…","No llegaste a la meta.");
        }
        return;
      }

      const cmd = program[pi++];
      switch(cmd){
        case "F": {
          const [dr,dc] = VEC[dir];
          const nr = r + dr, nc = c + dc;
          if(!onPath(nr,nc)){
            clearInterval(timer); timer = null;
            setRunning(false);
            writeStatus("Inténtalo de nuevo (fuera de la pista)", true);
            showModal("error","Ups…","Te saliste de la pista.");
            return;
          }
          r = nr; c = nc;
          break;
        }
        case "L": dir = DIRS[(DIRS.indexOf(dir)+3)%4]; break;
        case "R": dir = DIRS[(DIRS.indexOf(dir)+1)%4]; break;
      }

      spriteTo(r,c,dir);

      unhighlightAll(items);
      if(mi < stepMap.length-1){
        highlightMove(items, ++mi);
      }
    }, 420);
  }

  function resetAll(){
    if(timer){ clearInterval(timer); timer = null; }
    setRunning(false);
    robot = { r: ROWS-1, c: 0, dir: "E" };
    clearMoves();
    placeRobot();
    writeStatus("Reiniciado. Agrega movimientos y vuelve a ejecutar.");
  }

  function setRunning(running){
    const disabled = running;
    controlsEl.querySelectorAll("button").forEach(b=>b.disabled = disabled);
    btnExec.disabled = disabled;
    btnReset.disabled = disabled;
    btnConf.disabled  = disabled;
    btnSave.disabled  = disabled;
  }

  function expandLoops(seq){
    const out = [];
    const stack = [];
    for(let i=0;i<seq.length;i++){
      const m = seq[i];
      if(m === "B"){
        if(stack.length && stack[stack.length-1].open){
          const open = stack.pop();
          const block = seq.slice(open.i+1, i);
          for(let k=0;k<2;k++) out.push(...block);
        }else{
          stack.push({i, open:true});
        }
        continue;
      }
      if(stack.length===0) out.push(m);
    }
    return out;
  }

  function buildStepMap(seq){
    const map = [];
    const stack = [];
    for(let i=0;i<seq.length;i++){
      const m = seq[i];
      if(m==="B"){
        if(stack.length && stack[stack.length-1].open){
          const openI = stack.pop().i;
          const inner = seq.slice(openI+1, i);
          for(let k=0;k<inner.length;k++) map.push(openI+1+k);
          for(let k=0;k<inner.length;k++) map.push(openI+1+k);
        }else{
          stack.push({i, open:true});
          map.push(i);
        }
      }else{
        if(stack.length===0) map.push(i);
      }
    }
    return map.filter(i=>i < movesEl.children.length);
  }

  function farthestReachable(mat, sr, sc){
    if(!onPath(sr,sc)) return null;
    const q = [[sr,sc,0]];
    const seen = Array.from({length:ROWS},()=>Array(COLS).fill(false));
    seen[sr][sc] = true;
    let best = { r: sr, c: sc, d: 0 };
    while(q.length){
      const [r,c,d] = q.shift();
      if(d > best.d) best = { r, c, d };
      for(const [dr,dc] of Object.values(VEC)){
        const nr = r+dr, nc = c+dc;
        if(nr>=0 && nc>=0 && nr<ROWS && nc<COLS && mat[nr][nc] && !seen[nr][nc]){
          seen[nr][nc] = true;
          q.push([nr,nc,d+1]);
        }
      }
    }
    return { r: best.r, c: best.c };
  }

  function showModal(type, title, msg){
    modalTitle.textContent = title;
    modalMsg.textContent = msg;
    modalEl.setAttribute("aria-hidden","false");
  }
  function hideModal(){ modalEl?.setAttribute("aria-hidden","true"); }

  function highlightMove(items, idx){
    if(items[idx]) items[idx].classList.add("active");
  }
  function unhighlightAll(items){ items.forEach(li=>li.classList.remove("active")); }

  const onPath = (r,c)=> r>=0 && c>=0 && r<ROWS && c<COLS && !!track[r][c];
  const hasPath = ()=> track.flat().some(Boolean);
  const label = (m)=>({F:"↑ Adelante",L:"← Girar izquierda",R:"→ Girar derecha",B:"↺ Bucle"})[m];

  function cloneMatrix(m){ return m.map(row => row.slice()); }
  function writeStatus(msg, warn=false){
    statusEl.textContent = msg;
    statusEl.style.color = warn ? "#ff7a70" : "#bbb";
  }
})();
