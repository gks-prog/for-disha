(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ==========================================================================
  // 0. INSTAGRAM REEL VIDEO PRELOADER (AUTOPLAY + 12-SECOND COUNTDOWN)
  // ==========================================================================
  const preloader = document.getElementById('preloader');
  const preloaderVideo = document.getElementById('preloaderVideo');
  const preloaderIframe = document.getElementById('preloaderIframe');
  const preloaderProgressBar = document.getElementById('preloaderProgressBar');
  const preloaderStatusText = document.getElementById('preloaderStatusText');
  const preloaderTimerPill = document.getElementById('preloaderTimerPill');

  const REEL_SHORTCODE = 'DO2btgSk07n';
  const REEL_DURATION_SEC = 18;
  let preloaderDone = false;
  let reelElapsed = 0;
  let reelInterval = null;

  function playHeroEntrance() {
    if (!window.gsap || reduceMotion) return;
    gsap.fromTo('.hero-copy > *',
      { y: 28, opacity: 0 },
      { y: 0, opacity: 1, duration: 1, stagger: 0.13, ease: 'power3.out', delay: 0.1 }
    );
    gsap.fromTo('.hero-photo-wrap',
      { y: 40, rotate: -3, opacity: 0 },
      { y: 0, rotate: 2.5, opacity: 1, duration: 1.2, ease: 'power3.out', delay: 0.25 }
    );
    gsap.fromTo('.hero-sub-polaroid',
      { y: 30, rotate: -14, opacity: 0 },
      { y: 0, rotate: -7, opacity: 1, duration: 1.1, ease: 'back.out(1.7)', delay: 0.45 }
    );
  }

  // ==========================================================================
  // TRIPLE-LAYER BACKGROUND SONG ENGINE (https://youtu.be/OPugs48z2GU?si=oFvyXOB-Cf8KdVMv)
  // 1) Direct HTML5 <audio> stream resolved from OPugs48z2GU during the 18s preloader
  // 2) Full 240x200 YouTube IFrame API Player (avoids <200px viewport throttling)
  // 3) Warm Web Audio API music-box fallback if sandbox/network blocks external streams
  // ==========================================================================
  const YT_VIDEO_ID = 'OPugs48z2GU';
  const bgSongAudio = document.getElementById('bgSongAudio');
  const ytAudioIframe = document.getElementById('ytAudioIframe');
  const musicToggleBtn = document.getElementById('musicToggleBtn');
  const musicToggleLabel = document.getElementById('musicToggleLabel');

  let ytPlayer = null;
  let ytReady = false;
  let ytActuallyPlaying = false;
  let directAudioReady = false;
  let musicPlaying = false;
  let pendingPlayOnReady = false;

  // Web Audio API warm music-box fallback (only plays if YT + direct stream are blocked)
  let audioCtx = null;
  let synthInterval = null;
  let synthActive = false;

  function stopSynthFallback() {
    synthActive = false;
    if (synthInterval) {
      clearInterval(synthInterval);
      synthInterval = null;
    }
  }

  function startSynthFallback() {
    if (synthActive || ytActuallyPlaying || (bgSongAudio && !bgSongAudio.paused)) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx) audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      synthActive = true;
      // Gentle, dreamy music-box arpeggio in F major / D minor
      const notes = [349.23, 440.00, 523.25, 659.25, 587.33, 523.25, 440.00, 392.00];
      let step = 0;
      const playNote = () => {
        if (!synthActive || !musicPlaying) return;
        if (ytActuallyPlaying || (bgSongAudio && !bgSongAudio.paused)) {
          stopSynthFallback();
          return;
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(notes[step % notes.length], audioCtx.currentTime);
        gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 1.15);
        step++;
      };
      playNote();
      synthInterval = setInterval(playNote, 650);
    } catch (e) {}
  }

  // Pre-fetch direct audio stream of OPugs48z2GU into <audio id="bgSongAudio"> during the 18s preloader
  async function prefetchDirectSongStream() {
    if (!bgSongAudio) return;
    const apis = [
      `https://pipedapi.kavin.rocks/streams/${YT_VIDEO_ID}`,
      `https://pipedapi.tokhmi.xyz/streams/${YT_VIDEO_ID}`,
      `https://api.piped.private.coffee/streams/${YT_VIDEO_ID}`,
      `https://inv.tux.pizza/api/v1/videos/${YT_VIDEO_ID}`
    ];
    for (const url of apis) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        let streamUrl = null;
        if (Array.isArray(data.audioStreams) && data.audioStreams.length > 0) {
          const m4a = data.audioStreams.find(s => s.mimeType && s.mimeType.includes('mp4')) || data.audioStreams[0];
          streamUrl = m4a && m4a.url;
        } else if (Array.isArray(data.adaptiveFormats)) {
          const aud = data.adaptiveFormats.find(s => s.type && s.type.startsWith('audio/'));
          streamUrl = aud && aud.url;
        }
        if (streamUrl) {
          bgSongAudio.src = streamUrl;
          bgSongAudio.volume = 1.0;
          bgSongAudio.load();
          directAudioReady = true;
          return;
        }
      } catch (err) {}
    }
  }
  prefetchDirectSongStream();

  function sendYtCommand(func, args = []) {
    if (!ytAudioIframe || !ytAudioIframe.contentWindow) return;
    try {
      ytAudioIframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: func, args: args }),
        '*'
      );
    } catch (e) {}
  }

  function setMusicUiState(playing) {
    musicPlaying = playing;
    if (musicToggleBtn) {
      musicToggleBtn.classList.toggle('is-playing', playing);
      musicToggleBtn.setAttribute('aria-pressed', String(playing));
    }
    if (musicToggleLabel) {
      musicToggleLabel.textContent = playing ? 'Song Playing' : 'Play Song';
    }
  }

  function initYouTubePlayer() {
    if (ytPlayer || !window.YT || !window.YT.Player) return;
    ytPlayer = new window.YT.Player('ytAudioIframe', {
      events: {
        onReady: (e) => {
          ytReady = true;
          e.target.setVolume(100);
          if (pendingPlayOnReady || preloaderDone) {
            e.target.unMute();
            e.target.setVolume(100);
            e.target.playVideo();
            setMusicUiState(true);
          }
        },
        onStateChange: (e) => {
          if (e.data === 1) {
            ytActuallyPlaying = true;
            stopSynthFallback();
            if (bgSongAudio && !bgSongAudio.paused) {
              bgSongAudio.pause();
            }
          } else if (e.data === 0) {
            e.target.playVideo();
          }
        }
      }
    });
  }

  window.onYouTubeIframeAPIReady = initYouTubePlayer;
  if (window.YT && window.YT.Player) {
    initYouTubePlayer();
  }

  function startBackgroundSong() {
    pendingPlayOnReady = true;
    setMusicUiState(true);

    // 1) Try playing direct HTML5 <audio> stream if resolved
    if (bgSongAudio && directAudioReady) {
      bgSongAudio.volume = 1.0;
      bgSongAudio.muted = false;
      bgSongAudio.play().then(() => {
        stopSynthFallback();
      }).catch(() => {});
    }

    // 2) Trigger YouTube IFrame API player immediately at 100% volume
    if (ytPlayer && ytReady && typeof ytPlayer.playVideo === 'function') {
      try {
        ytPlayer.unMute();
        ytPlayer.setVolume(100);
        ytPlayer.playVideo();
      } catch (e) {}
    }
    sendYtCommand('unMute');
    sendYtCommand('setVolume', [100]);
    sendYtCommand('playVideo');

    // 3) If neither YT nor direct audio has started after 600ms (e.g. sandboxed preview), play music-box melody until YT/audio unlocks
    setTimeout(() => {
      if (musicPlaying && !ytActuallyPlaying && (!bgSongAudio || bgSongAudio.paused)) {
        startSynthFallback();
      }
    }, 600);
  }

  function pauseBackgroundSong() {
    pendingPlayOnReady = false;
    stopSynthFallback();
    if (bgSongAudio && !bgSongAudio.paused) {
      bgSongAudio.pause();
    }
    if (ytPlayer && ytReady && typeof ytPlayer.pauseVideo === 'function') {
      try {
        ytPlayer.pauseVideo();
      } catch (e) {}
    }
    sendYtCommand('pauseVideo');
    setMusicUiState(false);
  }

  if (musicToggleBtn) {
    musicToggleBtn.addEventListener('click', () => {
      if (musicPlaying) {
        pauseBackgroundSong();
      } else {
        startBackgroundSong();
      }
    });
  }

  // Unlock audio on any user gesture anywhere on the page (during or after preloader)
  function unlockAudioOnGesture() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    if (!preloaderDone) {
      // Pre-warm audio element silently during preloader gesture so post-preloader play() is 100% unlocked
      if (ytPlayer && ytReady && typeof ytPlayer.playVideo === 'function') {
        try {
          ytPlayer.mute();
          ytPlayer.playVideo();
          ytPlayer.pauseVideo();
          ytPlayer.unMute();
          ytPlayer.setVolume(100);
        } catch (e) {}
      }
      return;
    }
    if (musicPlaying) {
      startBackgroundSong();
    }
  }
  window.addEventListener('pointerdown', unlockAudioOnGesture, { passive: true });
  window.addEventListener('touchstart', unlockAudioOnGesture, { passive: true });
  window.addEventListener('keydown', unlockAudioOnGesture, { passive: true });
  window.addEventListener('click', unlockAudioOnGesture, { passive: true });

  function openWebsiteAfterVideo() {
    if (preloaderDone) return;
    preloaderDone = true;
    if (reelInterval) {
      clearInterval(reelInterval);
      reelInterval = null;
    }
    if (preloaderProgressBar) {
      preloaderProgressBar.style.width = '100%';
    }
    if (preloaderTimerPill) {
      preloaderTimerPill.textContent = '0s';
    }
    if (preloaderVideo && !preloaderVideo.paused) {
      preloaderVideo.pause();
    }
    // Stop preloader reel iframe audio when transitioning to website
    if (preloaderIframe) {
      preloaderIframe.setAttribute('src', 'about:blank');
    }
    if (preloader) {
      preloader.classList.add('is-finished');
    }
    document.body.classList.remove('preloader-locked');
    playHeroEntrance();
    // Start the YouTube background song (OPugs48z2GU) right as the website opens
    startBackgroundSong();
  }

  // Automatically resolve and play the direct Reel .mp4 stream in <video> so no click is needed
  async function autoPlayReelStream() {
    if (!preloaderVideo) return;
    preloaderVideo.muted = true;
    preloaderVideo.playsInline = true;
    preloaderVideo.autoplay = true;

    const embedTarget = `https://www.instagram.com/reel/${REEL_SHORTCODE}/embed/captioned/`;
    const proxyUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(embedTarget)}`,
      `https://corsproxy.io/?${encodeURIComponent(embedTarget)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(embedTarget)}`
    ];

    for (const url of proxyUrls) {
      if (preloaderDone) return;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const html = await res.text();
        const match = html.match(/"video_url"\s*:\s*"([^"]+)"/) || html.match(/src="([^"]+\.mp4[^"]*)"/);
        if (match && match[1]) {
          const rawUrl = match[1]
            .replace(/\u0026/g, '&')
            .replace(/\\//g, '/')
            .replace(/&amp;/g, '&');
          preloaderVideo.src = rawUrl;
          preloaderVideo.classList.add('is-active');
          await preloaderVideo.play();
          return;
        }
      } catch (err) {}
    }
  }

  // Also send autoplay commands to the embedded iframe on load
  if (preloaderIframe) {
    preloaderIframe.addEventListener('load', () => {
      try {
        preloaderIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
        preloaderIframe.contentWindow.postMessage({ type: 'play' }, '*');
      } catch (e) {}
    });
  }

  // 12-second automatic countdown timer
  function startTwelveSecCountdown() {
    if (reelInterval) clearInterval(reelInterval);
    reelElapsed = 0;
    reelInterval = setInterval(() => {
      if (preloaderDone) return;
      reelElapsed += 0.1;
      const pct = Math.min(100, (reelElapsed / REEL_DURATION_SEC) * 100);
      if (preloaderProgressBar) {
        preloaderProgressBar.style.width = `${pct}%`;
      }
      const remaining = Math.max(0, Math.ceil(REEL_DURATION_SEC - reelElapsed));
      if (preloaderTimerPill) {
        preloaderTimerPill.textContent = `${remaining}s`;
      }
      if (preloaderStatusText) {
        preloaderStatusText.textContent = remaining > 0
          ? `Opening Disha's garden in ${remaining}s ♡`
          : `Opening Disha's garden ♡`;
      }
      if (reelElapsed >= REEL_DURATION_SEC) {
        openWebsiteAfterVideo();
      }
    }, 100);
  }

  if (preloaderVideo) {
    preloaderVideo.addEventListener('ended', openWebsiteAfterVideo);
  }

  document.body.classList.add('preloader-locked');
  autoPlayReelStream();
  startTwelveSecCountdown();

  // ==========================================================================
  // 1. CONTINUOUS FLOATING FLOWERS & PETALS BESIDE THE WHOLE WEBSITE
  // ==========================================================================
  const petalsContainer = document.querySelector('.floating-petals');
  if (petalsContainer) {
    const symbols = ['✿', '❀', '🌸', '·', '✧', '🌷'];
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('span');
      p.className = 'petal';
      p.textContent = symbols[i % symbols.length];
      p.style.left = `${Math.random() * 100}%`;
      p.style.fontSize = `${11 + Math.random() * 13}px`;
      petalsContainer.appendChild(p);
    }
  }

  // ==========================================================================
  // 2. SOLID UNCHANGED INSTAGRAM DIRECT IMAGE LOADER WITH PROXY FALLBACK
  // ==========================================================================
  const IG_PHOTOS = [
    {
      slot: '1',
      shortcode: 'DCW80YVy3yD',
      fallbackSvg: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fbe8e2"/><stop offset="100%" stop-color="#e9c3b8"/></linearGradient></defs><rect width="400" height="500" fill="url(#g1)"/><circle cx="200" cy="215" r="76" fill="#fffaf6" opacity="0.65"/><text x="200" y="230" text-anchor="middle" font-size="44" fill="#d48286">✿</text><text x="200" y="345" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="20" fill="#6d524b">Disha ♡</text></svg>')
    },
    {
      slot: '2',
      shortcode: 'DAJPMFbyDdM',
      fallbackSvg: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f9ebe4"/><stop offset="100%" stop-color="#e5c8bc"/></linearGradient></defs><rect width="400" height="500" fill="url(#g2)"/><circle cx="200" cy="215" r="76" fill="#fffaf6" opacity="0.65"/><text x="200" y="230" text-anchor="middle" font-size="44" fill="#d48286">❀</text><text x="200" y="345" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="20" fill="#6d524b">Disha ♡</text></svg>')
    },
    {
      slot: '3',
      shortcode: 'C_YRbdxPI6f',
      fallbackSvg: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fdf0e8"/><stop offset="100%" stop-color="#eccbc1"/></linearGradient></defs><rect width="400" height="500" fill="url(#g3)"/><circle cx="200" cy="215" r="76" fill="#fffaf6" opacity="0.65"/><text x="200" y="230" text-anchor="middle" font-size="44" fill="#d48286">🌷</text><text x="200" y="345" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="20" fill="#6d524b">Disha ♡</text></svg>')
    },
    {
      slot: '4',
      shortcode: 'C3KRyAsN0LI',
      fallbackSvg: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f7e7e1"/><stop offset="100%" stop-color="#e3bfb5"/></linearGradient></defs><rect width="400" height="500" fill="url(#g4)"/><circle cx="200" cy="215" r="76" fill="#fffaf6" opacity="0.65"/><text x="200" y="230" text-anchor="middle" font-size="44" fill="#d48286">✨</text><text x="200" y="345" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="20" fill="#6d524b">Disha ♡</text></svg>')
    },
    {
      slot: '5',
      shortcode: 'C1ZAtaKPNLR',
      fallbackSvg: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g5" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fcece6"/><stop offset="100%" stop-color="#e7c4ba"/></linearGradient></defs><rect width="400" height="500" fill="url(#g5)"/><circle cx="200" cy="215" r="76" fill="#fffaf6" opacity="0.65"/><text x="200" y="230" text-anchor="middle" font-size="44" fill="#d48286">♡</text><text x="200" y="345" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="20" fill="#6d524b">Disha ♡</text></svg>')
    }
  ];

  const photoImages = document.querySelectorAll('img[data-photo-slot]');
  photoImages.forEach(img => {
    const slot = img.getAttribute('data-photo-slot');
    const cfg = IG_PHOTOS.find(p => p.slot === slot);
    if (!cfg) return;

    const candidates = [
      `https://www.instagram.com/p/${cfg.shortcode}/media/?size=l`,
      `https://wsrv.nl/?url=www.instagram.com/p/${cfg.shortcode}/media/?size=l`,
      `https://images.weserv.nl/?url=instagram.com/p/${cfg.shortcode}/media/?size=l`,
      cfg.fallbackSvg
    ];

    let attempt = 0;
    img.addEventListener('error', () => {
      attempt++;
      if (attempt < candidates.length) {
        img.src = candidates[attempt];
      }
    });
  });

  // ==========================================================================
  // 3. WINDY CLOTHESLINE BREEZE PHYSICS ON HANGING POLAROIDS
  // ==========================================================================
  const breezeBtn = document.getElementById('breezeBtn');
  const hangers = document.querySelectorAll('.polaroid-hanger');

  function triggerWindGust(strength = 1) {
    if (!window.gsap || reduceMotion || !hangers.length) return;
    hangers.forEach((hanger, idx) => {
      const card = hanger.querySelector('.polaroid-frame');
      if (!card) return;
      const dir = idx % 2 === 0 ? 1 : -1;
      gsap.timeline()
        .to(card, {
          rotation: (11 + idx * 1.5) * strength * dir,
          x: 10 * strength * dir,
          y: -4 * strength,
          duration: 0.45,
          delay: idx * 0.07,
          ease: 'sine.out'
        })
        .to(card, {
          rotation: -7 * strength * dir,
          x: -6 * strength * dir,
          y: 0,
          duration: 0.55,
          ease: 'sine.inOut'
        })
        .to(card, {
          rotation: 0,
          x: 0,
          y: 0,
          duration: 1.1,
          ease: 'elastic.out(1, 0.35)'
        });
    });
  }

  if (breezeBtn) {
    breezeBtn.addEventListener('click', () => triggerWindGust(1.25));
  }

  const clotheslineStage = document.querySelector('.clothesline-stage');
  if (clotheslineStage && window.gsap && !reduceMotion) {
    let lastGust = 0;
    clotheslineStage.addEventListener('mousemove', () => {
      const now = Date.now();
      if (now - lastGust < 1600) return;
      lastGust = now;
      triggerWindGust(0.55);
    });
  }

  // ==========================================================================
  // 4. GSAP SCROLL, FLOATING PETALS & SUBTLE MARGIN DOODLE MOTION
  // ==========================================================================
  if (window.gsap && !reduceMotion) {
    if (window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
    }
    gsap.to('.sticker-two', {
      rotation: 18,
      y: -8,
      duration: 2.2,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut'
    });
    gsap.to('.margin-doodle', {
      y: -10,
      rotation: 3,
      duration: 3.4,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      stagger: 0.4
    });
    gsap.utils.toArray('.section-kicker, .note-card, .bouquet-overline, .final-section h2').forEach(el => {
      gsap.from(el, {
        y: 32,
        opacity: 0,
        duration: 0.85,
        ease: 'power2.out',
        scrollTrigger: window.ScrollTrigger ? {
          trigger: el,
          start: 'top 88%'
        } : undefined
      });
    });
    gsap.to('.petal', {
      y: '110vh',
      x: 'random(-60, 60)',
      rotation: 'random(-180, 180)',
      duration: 'random(9, 17)',
      repeat: -1,
      ease: 'none',
      stagger: { each: 0.65, from: 'random' }
    });
  }

  // ==========================================================================
  // 5. ORGANIZED ILLUSTRATED & DOODLE BOUQUET UNWRAP ANIMATION
  // ==========================================================================
  const bouquetButton = document.getElementById('bouquetButton');
  const bouquet = document.getElementById('bouquetGraphic');
  const bouquetHint = document.getElementById('bouquetHint');
  const bouquetBurst = document.getElementById('bouquetBurst');
  const flowerWhisper = document.getElementById('flowerWhisper');
  const message = document.getElementById('bouquetMessage');

  const wrapFlapLeft = document.querySelector('.wrap-flap-left');
  const wrapFlapRight = document.querySelector('.wrap-flap-right');
  const wrapTissue = document.querySelector('.wrap-tissue');
  const wrapBack = document.querySelector('.wrap-back');
  const ribbonBand = document.querySelector('.ribbon-band');
  const bow = document.querySelector('.bow');

  const BLOOM_TARGETS = {
    f1: { x: -30, y: -16, rotation: -22, scale: 1.12 },
    f2: { x: 0,   y: -30, rotation: 0,   scale: 1.18 },
    f3: { x: 30,  y: -16, rotation: 22,  scale: 1.12 },
    f4: { x: -18, y: -12, rotation: -12, scale: 1.14 },
    f5: { x: 18,  y: -12, rotation: 12,  scale: 1.14 },
    f6: { x: 0,   y: -14, rotation: 0,   scale: 1.20 },
    f7: { x: -20, y: -26, rotation: -15, scale: 1.14 },
    f8: { x: 20,  y: -26, rotation: 15,  scale: 1.14 }
  };

  const LEAF_TARGETS = {
    l1: { x: -22, y: -10, rotation: -26, scale: 1.12 },
    l2: { x: 22,  y: -10, rotation: 26,  scale: 1.12 },
    l3: { x: -14, y: -18, rotation: -18, scale: 1.10 },
    l4: { x: 14,  y: -18, rotation: 18,  scale: 1.10 }
  };

  let opened = false;
  let unwrapTimeline = null;

  function burstBouquetPetals() {
    if (!bouquetBurst || reduceMotion || !window.gsap) return;
    const icons = ['🌸', '🌷', '✨', '♡', '❀', '🌹', '🌼', '✧'];
    for (let i = 0; i < 18; i++) {
      const spark = document.createElement('span');
      spark.className = 'bouquet-spark';
      spark.textContent = icons[i % icons.length];
      bouquetBurst.appendChild(spark);

      const angle = -Math.PI * (0.12 + 0.76 * (i / 17)) + (Math.random() * 0.2 - 0.1);
      const dist = 95 + Math.random() * 95;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist - 20;

      gsap.fromTo(spark,
        { x: 0, y: 20, scale: 0.3, opacity: 1, rotation: 0 },
        {
          x: tx,
          y: ty,
          scale: 1.15,
          rotation: (Math.random() - 0.5) * 160,
          opacity: 0,
          duration: 1.25 + Math.random() * 0.5,
          ease: 'power3.out',
          onComplete: () => spark.remove()
        }
      );
    }
  }

  if (bouquetButton && bouquet && message) {
    bouquetButton.addEventListener('click', () => {
      opened = !opened;
      message.classList.toggle('is-visible', opened);

      if (bouquetHint) {
        bouquetHint.textContent = opened
          ? 'Hover or tap any illustrated bloom for a birthday wish (or tap to wrap back up 🎀)'
          : 'Tap the illustrated bouquet to unwrap your flowers.';
      }

      if (flowerWhisper) {
        flowerWhisper.classList.toggle('is-active', opened);
        if (opened) {
          flowerWhisper.textContent = '✨ Unwrapped just for Disha — hover any bloom below ✨';
        }
      }

      if (window.gsap && !reduceMotion) {
        if (unwrapTimeline) {
          unwrapTimeline.kill();
        }
        unwrapTimeline = gsap.timeline();

        if (opened) {
          burstBouquetPetals();

          unwrapTimeline
            .to(bow, {
              y: 36,
              rotation: 18,
              scale: 0.82,
              opacity: 0.22,
              duration: 0.45,
              ease: 'back.in(1.6)'
            }, 0)
            .to(ribbonBand, {
              scaleX: 1.3,
              y: 20,
              opacity: 0,
              duration: 0.38,
              ease: 'power2.out'
            }, 0.05)
            .to(wrapFlapLeft, {
              rotation: -24,
              x: -22,
              y: 10,
              scale: 0.94,
              opacity: 0.65,
              duration: 0.65,
              ease: 'power3.out'
            }, 0.12)
            .to(wrapFlapRight, {
              rotation: 24,
              x: 22,
              y: 10,
              scale: 0.94,
              opacity: 0.65,
              duration: 0.65,
              ease: 'power3.out'
            }, 0.12)
            .to(wrapTissue, {
              scaleX: 1.16,
              scaleY: 1.1,
              y: -8,
              duration: 0.7,
              ease: 'back.out(1.7)'
            }, 0.15)
            .to(wrapBack, {
              scaleX: 1.08,
              duration: 0.6,
              ease: 'power2.out'
            }, 0.15)
            .to(bouquet, {
              y: -6,
              scale: 1.04,
              duration: 0.55,
              ease: 'back.out(2)'
            }, 0.15);

          Object.entries(LEAF_TARGETS).forEach(([cls, target]) => {
            unwrapTimeline.to(`.${cls}`, {
              x: target.x,
              y: target.y,
              rotation: target.rotation,
              scale: target.scale,
              duration: 0.7,
              ease: 'back.out(1.8)'
            }, 0.2);
          });

          Object.entries(BLOOM_TARGETS).forEach(([cls, target], idx) => {
            unwrapTimeline.to(`.${cls}`, {
              x: target.x,
              y: target.y,
              rotation: target.rotation,
              scale: target.scale,
              duration: 0.78,
              ease: 'elastic.out(1, 0.58)'
            }, 0.22 + idx * 0.045);
          });

        } else {
          Object.keys(BLOOM_TARGETS).forEach((cls) => {
            unwrapTimeline.to(`.${cls}`, {
              x: 0,
              y: 0,
              rotation: 0,
              scale: 1,
              duration: 0.5,
              ease: 'power3.inOut'
            }, 0);
          });

          Object.keys(LEAF_TARGETS).forEach((cls) => {
            unwrapTimeline.to(`.${cls}`, {
              x: 0,
              y: 0,
              rotation: 0,
              scale: 1,
              duration: 0.48,
              ease: 'power2.inOut'
            }, 0);
          });

          unwrapTimeline
            .to([wrapFlapLeft, wrapFlapRight], {
              rotation: 0,
              x: 0,
              y: 0,
              scale: 1,
              opacity: 1,
              duration: 0.52,
              ease: 'power3.inOut'
            }, 0.08)
            .to([wrapTissue, wrapBack], {
              scaleX: 1,
              scaleY: 1,
              y: 0,
              duration: 0.5,
              ease: 'power2.inOut'
            }, 0.08)
            .to(ribbonBand, {
              scaleX: 1,
              y: 0,
              opacity: 1,
              duration: 0.4,
              ease: 'power2.out'
            }, 0.22)
            .to(bow, {
              y: 0,
              rotation: 0,
              scale: 1,
              opacity: 1,
              duration: 0.5,
              ease: 'back.out(2)'
            }, 0.25)
            .to(bouquet, {
              y: 0,
              scale: 1,
              duration: 0.45,
              ease: 'power2.out'
            }, 0.1);
        }
      } else {
        bouquet.style.transform = opened ? 'scale(1.05)' : 'scale(1)';
      }

      bouquetButton.setAttribute('aria-label', opened ? 'Wrap your virtual bouquet back up' : 'Unwrap your virtual bouquet');
    });
  }

  document.querySelectorAll('.svg-flower[data-wish]').forEach(flowerEl => {
    flowerEl.addEventListener('mouseenter', () => {
      if (!opened || !flowerWhisper) return;
      flowerWhisper.textContent = flowerEl.getAttribute('data-wish');
    });
  });

  // ==========================================================================
  // 6. FINAL SECTION HEART BURST
  // ==========================================================================
  const finalHeartBtn = document.getElementById('finalHeartBtn');
  if (finalHeartBtn) {
    finalHeartBtn.addEventListener('click', () => {
      if (window.gsap && !reduceMotion) {
        gsap.fromTo(finalHeartBtn, { scale: 0.85 }, { scale: 1.18, duration: 0.4, yoyo: true, repeat: 1, ease: 'elastic.out(1, 0.4)' });
      }
    });
  }

  // ==========================================================================
  // 7. INTERACTIVE GUINEA PIG CORNER BUTTON (4-FRAME STORY)
  // ==========================================================================
  const FRAMES = [
    {
      src: 'assets/frame-1.jpg',
      alt: 'Sad guinea pig sitting curled up in the corner',
      badge: '💧',
      tag: 'sitting in the corner',
      speech: null,
      subhint: ''
    },
    {
      src: 'assets/frame-2.jpg',
      alt: 'Surprised teary-eyed guinea pig looking at you',
      badge: '❗',
      tag: 'wait... really?!',
      speech: 'its your birthday and you noticed me sitting in the corner,???',
      subhint: 'tap me again ✦'
    },
    {
      src: 'assets/frame-3.jpg',
      alt: 'Guinea pig crying happy tears of joy',
      badge: '🥹',
      tag: 'happy tears',
      speech: 'youreeee sooo kind and cute',
      subhint: 'one more tap ♡'
    },
    {
      src: 'assets/frame-4.jpg',
      alt: 'Happy guinea pig in a scarf holding a bouquet of red roses for you',
      badge: '🌹',
      tag: 'a gift for disha',
      speech: 'its for youuuuuu the kind soul',
      subhint: 'happy birthday! (tap to replay ↻)'
    }
  ];

  FRAMES.forEach(frame => {
    const img = new Image();
    img.src = frame.src;
  });

  const companionBtn = document.getElementById('companionBtn');
  const companionImg = document.getElementById('companionImg');
  const companionBadge = document.getElementById('companionBadge');
  const companionBubble = document.getElementById('companionBubble');
  const companionWhisper = document.getElementById('companionWhisper');
  const companionTag = document.getElementById('companionTag');
  const companionText = document.getElementById('companionText');
  const companionSubhint = document.getElementById('companionSubhint');
  const companionParticles = document.getElementById('companionParticles');
  const stepDots = document.querySelectorAll('.step-dot');

  let currentFrame = 0;

  function spawnParticles(icons, count = 10) {
    if (!companionParticles || reduceMotion) return;
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = 'burst-particle';
      el.textContent = icons[i % icons.length];
      companionParticles.appendChild(el);

      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25);
      const distance = 45 + Math.random() * 55;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance - 25;

      if (window.gsap) {
        gsap.fromTo(el,
          { x: 0, y: 0, scale: 0.4, opacity: 1 },
          {
            x: tx,
            y: ty,
            scale: 1.15,
            rotation: (Math.random() - 0.5) * 80,
            opacity: 0,
            duration: 0.9 + Math.random() * 0.4,
            ease: 'power2.out',
            onComplete: () => el.remove()
          }
        );
      } else {
        setTimeout(() => el.remove(), 900);
      }
    }
  }

  function renderFrame(index) {
    const frame = FRAMES[index];
    companionBtn.setAttribute('data-frame', String(index));
    companionImg.src = frame.src;
    companionImg.alt = frame.alt;
    companionBadge.textContent = frame.badge;

    stepDots.forEach((dot, i) => {
      dot.classList.toggle('is-active', i < index);
    });

    if (index === 0) {
      companionBubble.classList.remove('is-open');
      companionWhisper.classList.remove('is-hidden');
    } else {
      companionWhisper.classList.add('is-hidden');
      companionTag.textContent = frame.tag;
      companionText.textContent = frame.speech;
      companionSubhint.innerHTML = `<span>${frame.subhint}</span>`;
      companionBubble.classList.add('is-open');
    }

    if (window.gsap && !reduceMotion) {
      gsap.fromTo(companionImg,
        { scale: 0.84, opacity: 0.7 },
        { scale: 1, opacity: 1, duration: 0.42, ease: 'back.out(2)' }
      );
      if (index > 0) {
        gsap.fromTo(companionBubble,
          { y: 10, scale: 0.94 },
          { y: 0, scale: 1, duration: 0.4, ease: 'back.out(2.2)' }
        );
      }
    }

    if (index === 1) {
      spawnParticles(['💧', '✦', '❕'], 6);
    } else if (index === 2) {
      spawnParticles(['💧', '♡', '✨', '❀'], 9);
    } else if (index === 3) {
      spawnParticles(['🌹', '♡', '✨', '🌷', '🌙'], 14);
    }
  }

  function advanceCompanion() {
    currentFrame = (currentFrame + 1) % FRAMES.length;
    renderFrame(currentFrame);
  }

  if (companionBtn) {
    companionBtn.addEventListener('click', advanceCompanion);
  }
  if (companionWhisper) {
    companionWhisper.addEventListener('click', advanceCompanion);
  }
  if (companionBubble) {
    companionBubble.addEventListener('click', advanceCompanion);
  }
})();
