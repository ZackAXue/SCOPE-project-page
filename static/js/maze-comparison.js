(() => {
  const root = document.querySelector('#maze-comparison');
  if (!root) return;
  const videos = Object.fromEntries([...root.querySelectorAll('video')].map(v => [v.dataset.mazeMethod, v]));
  const toolbar = root.querySelector('.maze-playback');
  const play = root.querySelector('[data-maze-play]');
  const timeline = root.querySelector('[data-maze-timeline]');
  const status = root.querySelector('[data-maze-status]');
  const fps = 24, end = 930 / fps;
  const frames = { mppi: 714, logmppi: 377, diffmppi: 424, scope: 249 };
  const pending = new Set();
  let mode = 'sync', time = 0, running = false, visible = false, loaded = false;
  let last = performance.now();
  let contactRequest = 0;
  let playbackError = '';
  let autoStart = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load() {
    if (loaded && !Object.values(videos).some(v => v.error)) return;
    loaded = true;
    playbackError = '';
    Object.values(videos).forEach(v => { v.preload = 'auto'; v.load(); });
  }
  function pauseAll() {
    running = false;
    Object.values(videos).forEach(v => v.pause());
    play.textContent = 'Play';
  }
  function failPlayback(message) {
    autoStart = false;
    contactRequest++;
    playbackError = message;
    pauseAll();
    status.textContent = message;
  }
  function start(v) {
    if (!v.paused || pending.has(v)) return;
    const request = contactRequest;
    pending.add(v);
    v.play().then(() => {
      if (!running) v.pause();
    }).catch(error => {
      if (request === contactRequest && running && error.name !== 'AbortError') {
        failPlayback('Video unavailable. Press Play to retry.');
      }
    }).finally(() => pending.delete(v));
  }
  function point(name) {
    const f = time * fps;
    let base = f, active = null;
    if (f >= 208 && f < 424) { base = 207; active = 'diffmppi'; }
    else if (f >= 424 && f < 714) base = f - 216;
    else if (f >= 714) { base = 497; active = f < 930 ? 'mppi' : null; }
    let local = base;
    if (name === 'diffmppi') local = Math.min(f, 423);
    if (name === 'mppi' && f >= 714) local = 498 + f - 714;
    return { time: Math.max(0, Math.min(local, frames[name] - 1)) / fps,
      hold: local >= frames[name] - 1 || (active && active !== name), active };
  }
  function align(force = false) {
    for (const [name, v] of Object.entries(videos)) {
      if (!Number.isFinite(v.duration)) continue;
      const p = point(name);
      if (!v.seeking && (force || Math.abs(v.currentTime - p.time) > .15)) v.currentTime = p.time;
      if (running && visible && !document.hidden && !p.hold) start(v);
      else v.pause();
    }
    status.textContent = playbackError || (time >= end ? 'Complete' : point('scope').active ? 'Collision detail · other views paused' : '512 samples per update');
    timeline.value = time;
    play.textContent = running ? 'Pause' : 'Play';
  }
  function setMode(value) {
    contactRequest++;
    mode = value;
    autoStart = false;
    Object.values(videos).forEach(v => { v.pause(); v.controls = mode === 'independent'; });
    root.querySelectorAll('[data-maze-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mazeMode === mode));
    timeline.hidden = mode !== 'sync';
    running = false;
    play.textContent = 'Play';
    if (mode === 'sync') { time = 0; align(true); }
    else status.textContent = 'Play or scrub each video';
  }
  toolbar.hidden = false;
  Object.values(videos).forEach(v => {
    v.controls = false; v.loop = false;
    v.addEventListener('error', () => failPlayback('Video unavailable. Press Play to retry.'));
  });
  root.querySelectorAll('[data-maze-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mazeMode)));
  play.addEventListener('click', () => {
    contactRequest++; autoStart = false;
    // Pause is an explicit command, including while a play/seek is pending.
    // Do not seek or reload media when the user wants to freeze the frame.
    if (running) { pauseAll(); last = performance.now(); return; }
    playbackError = ''; load();
    if (mode === 'sync') {
      if (time >= end) time = 0;
      running = true;
      align(true);
    } else {
      running = true;
      Object.values(videos).forEach(v => start(v));
      play.textContent = running ? 'Pause' : 'Play';
    }
    last = performance.now();
  });
  root.querySelector('[data-maze-replay]').addEventListener('click', () => {
    contactRequest++; load(); autoStart = false; time = 0; running = true; last = performance.now();
    if (mode === 'sync') align(true);
    else Object.values(videos).forEach(v => { v.currentTime = 0; start(v); });
    play.textContent = 'Pause';
  });
  timeline.addEventListener('input', () => { contactRequest++; load(); autoStart = false; time = Number(timeline.value); last = performance.now(); align(true); });
  function seekTo(v, target) {
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        v.removeEventListener('loadedmetadata', seek);
        v.removeEventListener('seeked', done);
        v.removeEventListener('error', fail);
      };
      const done = () => {
        if (Math.abs(v.currentTime - target) > .15) return;
        cleanup(); resolve();
      };
      const fail = () => { cleanup(); reject(new Error('Video seek unavailable')); };
      const seek = () => {
        v.pause();
        if (Math.abs(v.currentTime - target) < .05 && !v.seeking) { done(); return; }
        v.currentTime = target;
      };
      timer = setTimeout(fail, 12000);
      v.addEventListener('seeked', done);
      v.addEventListener('error', fail);
      if (v.readyState >= 1) seek();
      else v.addEventListener('loadedmetadata', seek, { once: true });
    });
  }
  root.querySelectorAll('[data-maze-contact]').forEach(b => b.addEventListener('click', async () => {
    load(); setMode('independent');
    const request = contactRequest;
    const name = b.dataset.mazeContact, v = videos[name];
    status.textContent = 'Loading collision detail…';
    try {
      await seekTo(v, (name === 'diffmppi' ? 208 : 498) / fps);
      if (request !== contactRequest) return;
      start(v);
      running = true;
      play.textContent = 'Pause';
      status.textContent = (name === 'diffmppi' ? 'Diff-MPPI' : 'Vanilla MPPI') + ' · collision detail';
    } catch {
      if (request === contactRequest) status.textContent = 'Could not seek. Please retry.';
    }
  }));
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) {
      load();
      if (autoStart) { autoStart = false; running = true; }
      last = performance.now();
    } else Object.values(videos).forEach(v => v.pause());
  }, { threshold: 0 });
  observer.observe(root);
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden) Object.values(videos).forEach(v => v.pause());
  });
  function tick(now) {
    if (mode === 'sync' && visible && !document.hidden && loaded) {
      const ready = Object.entries(videos).every(([name, v]) => point(name).hold || (v.readyState >= 3 && !v.seeking));
      if (running && ready) time = Math.min(end, time + Math.min((now - last) / 1000, .1));
      if (time >= end) running = false;
      align();
    }
    last = now;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
