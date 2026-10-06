(() => {
  const root = document.querySelector('#crowd-comparison');
  if (!root) return;
  const videos = [...root.querySelectorAll('video')];
  const master = videos[0];
  const play = root.querySelector('[data-crowd-play]');
  const message = root.querySelector('[data-crowd-message]');
  const contact = root.querySelector('[data-crowd-contact]');
  const collisionNote = root.querySelector('#crowd-collision-note');
  function showCollisionNote(show) {
    collisionNote.hidden = !show;
    contact.setAttribute('aria-expanded', String(show));
  }
  let data, loaded = false, wanted = false, visible = false, busy = false;
  let starting = false, hasStarted = false, request = 0;
  const pause = () => videos.forEach(video => video.pause());
  const label = () => { play.textContent = wanted ? 'Pause' : 'Play'; };
  function load() {
    if (loaded) return;
    loaded = true;
    videos.forEach(video => { video.preload = 'auto'; video.load(); });
  }
  function readout() {
    if (!data || !hasStarted) return;
    const frame = Math.min(data.times.length - 1, Math.floor(master.currentTime * data.fps + 1e-4));
    const sim = data.times[Math.max(0, frame)];
    videos.forEach(video => {
      const method = video.dataset.crowdMethod;
      const end = method === 'ens64' ? data.collisionTime : data.goalTime;
      const finished = sim >= end - 1e-5;
      root.querySelector(`[data-crowd-clock="${method}"]`).textContent = Math.min(sim, end).toFixed(finished && method === 'ens64' ? 2 : 1) + ' s';
      root.querySelector(`[data-crowd-result="${method}"]`).textContent = finished ? (method === 'ens64' ? 'Collision' : 'Goal reached') : '';
    });
  }
  async function resume() {
    if (starting || busy || !wanted || !visible || document.hidden) return;
    if (!videos.every(video => video.readyState >= 3 && !video.seeking)) return;
    starting = true;
    try {
      await Promise.all(videos.map(video => video.play()));
      if (!wanted || !visible || document.hidden || busy) pause();
    } catch {
      pause(); wanted = false; label();
      message.textContent = 'Playback unavailable. Please retry.';
    } finally { starting = false; }
  }
  function seekTo(video, target) {
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', seek);
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', fail);
      };
      const done = () => {
        if (video.seeking || Math.abs(video.currentTime - target) > .08) return;
        cleanup(); resolve();
      };
      const fail = () => { cleanup(); reject(new Error('Seek unavailable')); };
      const seek = () => {
        video.pause();
        if (!video.seeking && Math.abs(video.currentTime - target) < .02) { done(); return; }
        video.currentTime = target;
      };
      timer = setTimeout(fail, 15000);
      video.addEventListener('seeked', done);
      video.addEventListener('error', fail);
      if (video.readyState >= 1) seek();
      else video.addEventListener('loadedmetadata', seek, {once: true});
    });
  }
  async function go(target) {
    if (target === 0) showCollisionNote(false);
    const token = ++request;
    wanted = true; busy = true; pause(); label(); load();
    message.textContent = 'Loading…';
    try {
      await Promise.all(videos.map(video => seekTo(video, target)));
      if (token !== request) return;
      busy = false; hasStarted = true; message.textContent = '';
      root.querySelectorAll('[data-crowd-clock]').forEach(clock => { clock.hidden = false; });
      readout(); resume();
    } catch {
      if (token !== request) return;
      busy = false; wanted = false; pause(); label();
      message.textContent = 'Could not load this moment. Please retry.';
    }
  }
  function tick() {
    readout();
    if (wanted && visible && !document.hidden && !busy) {
      if (!videos.every(video => video.readyState >= 3 && !video.seeking)) pause();
      else {
        const follower = videos[1];
        if (Math.abs(follower.currentTime - master.currentTime) > .12) {
          pause(); follower.currentTime = master.currentTime;
        } else if (videos.some(video => video.paused)) resume();
      }
    }
    requestAnimationFrame(tick);
  }
  // Keep native controls as the fallback if the simulation timeline cannot load.
  fetch(root.dataset.timeline).then(response => {
    if (!response.ok) throw new Error('Timeline unavailable');
    return response.json();
  }).then(value => {
    data = value;
    root.querySelector('.crowd-playback').hidden = false;
    videos.forEach(video => { video.controls = false; video.loop = false; });
    play.addEventListener('click', () => {
      if (wanted) {
        request++; wanted = false; busy = false; pause(); label(); message.textContent = '';
      } else go(master.ended ? 0 : master.currentTime);
    });
    root.querySelector('[data-crowd-replay]').addEventListener('click', () => go(0));
    contact.addEventListener('click', () => {
      showCollisionNote(true);
      go(data.collisionDetail);
    });
    master.addEventListener('ended', () => { wanted = false; pause(); label(); readout(); });
    videos.forEach(video => video.addEventListener('waiting', () => { if (wanted) pause(); }));
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) { load(); resume(); } else pause();
    }, {threshold: 0}).observe(root);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); });
    requestAnimationFrame(tick);
  }).catch(() => {
    root.querySelectorAll('[data-crowd-clock]').forEach(clock => { clock.hidden = true; });
  });
})();
