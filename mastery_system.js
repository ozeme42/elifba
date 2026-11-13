/* =========================================================
   28 ADIM İNTERAKTİF OKUMA ALIŞTIRMALARI & BAŞARI SİSTEMİ
   Tüm 28 Ders Adımı & 8 Namaz Duası İçin Uçtan Uca Takip
   ========================================================= */

(function() {
  const STORAGE_KEY = 'elifba_reading_mastery_v2';

  // Durum Değişkenleri
  let readItemsSet = new Set();
  let currentActiveStep = 1;
  let currentDrillFilter = 'all'; // 'all', 'unread', 'read'
  let currentViewMode = 'grid'; // 'grid', 'flashcard', 'autoloop', 'quiz'
  let currentFlashcardIndex = 0;
  let autoLoopActive = false;
  let autoLoopTimer = null;
  let autoLoopSpeed = 2200; // ms bekleme
  let activeAudioObj = null;

  // 1. Veri Yükleme & Kaydetme
  function loadStoredProgress() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (Array.isArray(data.readItems)) {
          readItemsSet = new Set(data.readItems);
        }
        if (data.lastActiveStep && typeof data.lastActiveStep === 'number') {
          currentActiveStep = data.lastActiveStep;
        }
      }
    } catch (e) {
      console.warn('LocalStorage progress load error:', e);
    }
  }

  function saveProgress() {
    try {
      const data = {
        readItems: Array.from(readItemsSet),
        lastActiveStep: currentActiveStep,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('LocalStorage progress save error:', e);
    }
  }

  // 2. İstatistik Hesaplayıcıları
  function getStepData(stepNumber) {
    if (!window.CURRICULUM_STEPS) return null;
    return window.CURRICULUM_STEPS.find(s => s.step === stepNumber) || window.CURRICULUM_STEPS[0];
  }

  function getStepCompletedCount(stepNumber) {
    const step = getStepData(stepNumber);
    if (!step || !step.items) return 0;
    let count = 0;
    step.items.forEach(it => {
      if (readItemsSet.has(it.id)) count++;
    });
    return count;
  }

  function isStepMastered(stepNumber) {
    const step = getStepData(stepNumber);
    if (!step || !step.items || step.items.length === 0) return false;
    return getStepCompletedCount(stepNumber) === step.items.length;
  }

  function getTotalItemsCount() {
    if (!window.CURRICULUM_STEPS) return 777;
    return window.CURRICULUM_STEPS.reduce((acc, s) => acc + (s.itemCount || 0), 0);
  }

  function getTotalReadItemsCount() {
    return readItemsSet.size;
  }

  function getTotalMasteredStepsCount() {
    if (!window.CURRICULUM_STEPS) return 0;
    return window.CURRICULUM_STEPS.filter(s => isStepMastered(s.step)).length;
  }

  // 3. Genel Başarı Paneli Render
  function renderMasteryDashboard() {
    const totalItems = getTotalItemsCount();
    const readCount = getTotalReadItemsCount();
    const totalSteps = window.CURRICULUM_STEPS ? window.CURRICULUM_STEPS.length : 36;
    const masteredSteps = getTotalMasteredStepsCount();
    const percentage = totalItems > 0 ? Math.round((readCount / totalItems) * 100) : 0;

    const elRead = document.getElementById('totalReadCount');
    const elSteps = document.getElementById('totalMasteredSteps');
    const elStars = document.getElementById('totalStarsEarned');
    const elPercentText = document.getElementById('overallPercentageText');
    const elProgressBar = document.getElementById('overallProgressBar');
    const elResumeStep = document.getElementById('resumeStepLabel');

    if (elRead) elRead.textContent = `${readCount} / ${totalItems}`;
    if (elSteps) elSteps.textContent = `${masteredSteps} / ${totalSteps}`;
    if (elStars) elStars.textContent = `⭐ ${readCount * 10}`;
    if (elPercentText) elPercentText.textContent = `%${percentage} Tamamlandı`;
    if (elProgressBar) elProgressBar.style.width = `${percentage}%`;

    const activeStepData = getStepData(currentActiveStep);
    if (elResumeStep && activeStepData) {
      elResumeStep.textContent = activeStepData.shortTitle || `Adım ${currentActiveStep}`;
    }
  }

  // 4. Adım Seçici (Navigator) Render
  function renderStepNavigator(categoryFilter) {
    const container = document.getElementById('stepChipsContainer');
    if (!container || !window.CURRICULUM_STEPS) return;
    container.innerHTML = '';

    let list = window.CURRICULUM_STEPS;
    if (categoryFilter && categoryFilter !== 'all') {
      list = list.filter(s => s.cat === categoryFilter);
    }

    list.forEach(step => {
      const completed = getStepCompletedCount(step.step);
      const total = step.itemCount || step.items.length;
      const mastered = (total > 0 && completed === total);
      const active = (step.step === currentActiveStep);

      const card = document.createElement('div');
      card.className = `step-chip-card ${active ? 'active' : ''} ${mastered ? 'mastered' : ''}`;
      card.onclick = () => {
        window.loadStepDrills(step.step);
      };

      const stepPrefix = step.isDua ? `Dua ${step.step - 28}` : `Adım ${step.step}`;
      const statusIcon = mastered ? '👑 Tamam' : (completed > 0 ? `🔥 ${completed}/${total}` : `⚪ 0/${total}`);

      card.innerHTML = `
        <div class="step-chip-header">
          <span class="step-chip-num">${stepPrefix}</span>
          <span class="step-chip-badge">${statusIcon}</span>
        </div>
        <div class="step-chip-title" title="${step.title}">${step.shortTitle || step.title}</div>
        <div class="step-chip-mini-bar">
          <div class="step-chip-mini-fill" style="width: ${total > 0 ? Math.round((completed / total) * 100) : 0}%"></div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // 5. Aktif Adım Okuma Alıştırması Yükleme
  window.loadStepDrills = function(stepNumber) {
    currentActiveStep = stepNumber;
    saveProgress();

    const step = getStepData(stepNumber);
    if (!step) return;

    // Banner Güncelle
    const studio = document.getElementById('activeStepStudio');
    if (studio) studio.style.setProperty('--step-color', step.color || '#4361ee');

    const elCatTag = document.getElementById('studioCatTag');
    const elStepTag = document.getElementById('studioStepTag');
    const elTitle = document.getElementById('studioTitle');
    const elRule = document.getElementById('studioRuleText');

    if (elCatTag) elCatTag.textContent = step.catName || "Kur'an Elifbası";
    if (elStepTag) elStepTag.textContent = step.isDua ? `Namaz Duası ${step.step - 28} / 8` : `Adım ${step.step} / 28`;
    if (elTitle) elTitle.textContent = step.title;
    if (elRule) elRule.textContent = step.desc;

    updateActiveStepMasteryBar();
    renderDrillItems();

    // Reset Flashcard & Loop
    currentFlashcardIndex = 0;
    stopStepAutoLoop();

    // Navigator'ı güncelle
    const activeChip = document.querySelector('.step-chip-card.active');
    if (activeChip) activeChip.classList.remove('active');
    renderStepNavigator(window.currentCurriculumCat || 'all');
    renderMasteryDashboard();
  };

  function updateActiveStepMasteryBar() {
    const step = getStepData(currentActiveStep);
    if (!step) return;

    const completed = getStepCompletedCount(step.step);
    const total = step.itemCount || step.items.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const mastered = (total > 0 && completed === total);

    const elCount = document.getElementById('studioMasteryCount');
    const elFill = document.getElementById('studioMasteryFill');
    const elMsg = document.getElementById('studioMotivateMsg');

    if (elCount) elCount.textContent = `${completed} / ${total} Kelime Başarıyla Okundu (%${percent})`;
    if (elFill) elFill.style.width = `${percent}%`;

    if (elMsg) {
      if (mastered) {
        elMsg.className = 'mastery-motivate-msg complete';
        elMsg.innerHTML = '🏆 <strong>MAŞALLAH!</strong> Bu adımdaki tüm kelimeleri eksiksiz okudun! Adım başarıyla tamamlandı 👑 ⭐⭐⭐';
      } else {
        const remaining = total - completed;
        elMsg.className = 'mastery-motivate-msg incomplete';
        elMsg.innerHTML = `⏳ <strong>Çalışmaya Devam!</strong> Bu adımı tamamlamak için kalan <strong>${remaining}</strong> kelimeyi de dinle, tekrar et ve "Ben Okudum"a bas!`;
      }
    }
  }

  // 6. Okuma Maddeleri Grid Render
  function renderDrillItems() {
    const grid = document.getElementById('drillItemsGrid');
    const fcView = document.getElementById('flashcardViewContainer');
    const quizView = document.getElementById('stepQuizContainer');

    if (!grid) return;

    if (currentViewMode === 'flashcard') {
      grid.style.display = 'none';
      if (quizView) quizView.style.display = 'none';
      if (fcView) {
        fcView.style.display = 'flex';
        renderFlashcardView();
      }
      return;
    } else if (currentViewMode === 'quiz') {
      grid.style.display = 'none';
      if (fcView) fcView.style.display = 'none';
      if (quizView) {
        quizView.style.display = 'block';
        initStepQuiz();
      }
      return;
    }

    // Grid Modu
    if (fcView) fcView.style.display = 'none';
    if (quizView) quizView.style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = '';

    const step = getStepData(currentActiveStep);
    if (!step || !step.items) return;

    let items = step.items;
    if (currentDrillFilter === 'unread') {
      items = items.filter(it => !readItemsSet.has(it.id));
    } else if (currentDrillFilter === 'read') {
      items = items.filter(it => readItemsSet.has(it.id));
    }

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: #f8fafc; border-radius: 16px; border: 2px dashed #cbd5e1;">
          <div style="font-size: 3rem; margin-bottom: 10px;">🌟</div>
          <h3 style="color: #1e293b; font-weight: 900; margin-bottom: 6px;">
            ${currentDrillFilter === 'unread' ? 'Tebrikler! Okunmamış kelime kalmadı!' : 'Henüz bu filtrede kelime yok.'}
          </h3>
          <p style="color: #64748b; font-weight: 700;">"Tümü" filtresini seçerek tüm kelimeleri görebilirsin.</p>
          <button class="tool-btn active" onclick="window.filterDrillItems('all', this)" style="margin: 14px auto 0;">
            🌈 Tüm Kelimeleri Göster
          </button>
        </div>
      `;
      return;
    }

    items.forEach(it => {
      const isRead = readItemsSet.has(it.id);
      const card = document.createElement('div');
      card.className = `drill-card ${isRead ? 'mastered' : ''}`;
      card.id = `card_${it.id}`;

      // Kart tıklanınca sesi çal
      card.onclick = (e) => {
        // butonlara tıklandıysa event propagation durdurulmuş olacak
        window.playDrillAudio(it.audio, card);
      };

      card.innerHTML = `
        <div class="drill-card-top">
          <span class="drill-item-num">#${it.num}</span>
          <span class="drill-status-tag" id="tag_${it.id}">${isRead ? '✅ Okundu ⭐' : '⚪ Bekliyor'}</span>
        </div>
        <div class="drill-img-container" title="Dinlemek için tıkla">
          ${it.img ? `<img class="drill-img" src="${it.img}" alt="${it.alt || 'Kelime'}" loading="lazy" />` : `<div style="font-family:'Amiri'; font-size:3rem; color:#1e1b4b;">${it.alt}</div>`}
          <div class="drill-sound-waves">
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
          </div>
        </div>
        <div class="drill-actions" onclick="event.stopPropagation()">
          <button class="btn-drill-listen" onclick="window.playDrillAudio('${it.audio}', this.closest('.drill-card'))" title="Sesi Dinle">
            🔊 Dinle
          </button>
          <button class="btn-drill-confirm" id="btn_confirm_${it.id}" onclick="window.markItemAsRead('${it.id}', ${currentActiveStep}, this.closest('.drill-card'))">
            ${isRead ? '✓ Okundu' : '🗣️ Okudum'}
          </button>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  // 7. Kelimeyi Okundu Olarak İşaretleme & Başarı Tetikleme
  window.markItemAsRead = function(itemId, stepNumber, cardElement) {
    const alreadyRead = readItemsSet.has(itemId);
    
    // Her iki durumda da ses ve geri bildirim
    if (!alreadyRead) {
      readItemsSet.add(itemId);
      saveProgress();

      // Yıldız ve Efekt
      if (typeof window.addStars === 'function') {
        window.addStars(10);
      }
      playCheerChime();

      // Kart Efekti
      if (cardElement) {
        cardElement.classList.add('mastered');
        const tag = cardElement.querySelector('.drill-status-tag');
        if (tag) tag.textContent = '✅ Okundu ⭐';
        const btn = cardElement.querySelector('.btn-drill-confirm');
        if (btn) btn.textContent = '✓ Okundu';

        // Konfeti
        if (typeof window.triggerConfetti === 'function') {
          window.triggerConfetti();
        }
      }

      // Bar & Dashboard Güncelle
      updateActiveStepMasteryBar();
      renderMasteryDashboard();
      renderStepNavigator(window.currentCurriculumCat || 'all');

      // ADIM TAMAMLANDI MI KONTROL ET!
      const step = getStepData(stepNumber);
      if (step && isStepMastered(stepNumber)) {
        setTimeout(() => {
          showStepMasteryCelebration(step);
        }, 500);
      }
    } else {
      // Zaten okundu, tekrar pekiştirildi
      playCheerChime();
      if (cardElement) {
        cardElement.style.transform = 'scale(1.05)';
        setTimeout(() => { cardElement.style.transform = ''; }, 200);
      }
    }
  };

  // 8. Ses Çalma
  window.playDrillAudio = function(audioPath, cardElement) {
    if (!audioPath) return;

    if (activeAudioObj) {
      activeAudioObj.pause();
      activeAudioObj.currentTime = 0;
    }

    document.querySelectorAll('.drill-card.playing').forEach(c => c.classList.remove('playing'));
    if (cardElement) cardElement.classList.add('playing');

    activeAudioObj = new Audio(audioPath);
    activeAudioObj.play().catch(e => {
      console.log('Audio play error:', e);
    });

    activeAudioObj.onended = () => {
      if (cardElement) cardElement.classList.remove('playing');
    };
  };

  // 9. Neşeli Başarı Çanı (Web Audio Synthesizer)
  function playCheerChime() {
    try {
      const ctx = window.getAudioContext ? window.getAudioContext() : new (window.AudioContext || window.webkitAudioContext)();
      if (!ctx) return;
      const now = ctx.currentTime;

      // 3 tonlu melodik çan (C6 - E6 - G6)
      const freqs = [1046.50, 1318.51, 1567.98];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.5);
      });
    } catch (e) {
      // fallback
    }
  }

  // 10. Triumphant Fanfare (Tören Müziği)
  function playTriumphantFanfare() {
    try {
      const ctx = window.getAudioContext ? window.getAudioContext() : new (window.AudioContext || window.webkitAudioContext)();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Fanfare notaları: G4 -> C5 -> E5 -> G5
      const notes = [
        { f: 392.00, t: 0.0, d: 0.15 },
        { f: 523.25, t: 0.16, d: 0.15 },
        { f: 659.25, t: 0.32, d: 0.18 },
        { f: 783.99, t: 0.50, d: 0.60 }
      ];

      notes.forEach(n => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(n.f, now + n.t);

        gain.gain.setValueAtTime(0, now + n.t);
        gain.gain.linearRampToValueAtTime(0.3, now + n.t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + n.t);
        osc.stop(now + n.t + n.d + 0.05);
      });
    } catch (e) {
      //
    }
  }

  // 11. Grand Step Celebration Modal (Tüm Adım Başarı Töreni)
  function showStepMasteryCelebration(step) {
    playTriumphantFanfare();
    if (typeof window.triggerConfetti === 'function') {
      window.triggerConfetti();
      setTimeout(window.triggerConfetti, 400);
      setTimeout(window.triggerConfetti, 800);
    }

    const modal = document.getElementById('stepTrophyModal');
    if (!modal) return;

    const title = document.getElementById('trophyStepTitle');
    const desc = document.getElementById('trophyStepDesc');
    const btnNext = document.getElementById('btnTrophyNextStep');

    const nextStepNum = step.step + 1;
    const hasNext = window.CURRICULUM_STEPS && window.CURRICULUM_STEPS.some(s => s.step === nextStepNum);

    if (title) title.textContent = `🎉 MAŞALLAH! ${step.title} Tamamlandı!`;
    if (desc) desc.textContent = `Bu adımdaki ${step.itemCount || step.items.length} okuma alıştırmasının hepsini başarıyla tamamlayıp Altın Taç 👑 kazandın!`;

    if (btnNext) {
      if (hasNext) {
        btnNext.style.display = 'inline-flex';
        btnNext.textContent = `🚀 Sonraki Adıma Geç (Adım ${nextStepNum})`;
        btnNext.onclick = () => {
          closeStepCelebrationModal();
          window.loadStepDrills(nextStepNum);
          document.getElementById('activeStepStudio').scrollIntoView({ behavior: 'smooth' });
        };
      } else {
        btnNext.textContent = `🎓 Tüm Müfredatı Bitirdin! 🏆`;
        btnNext.onclick = () => { closeStepCelebrationModal(); };
      }
    }

    modal.classList.add('active');
  }

  window.closeStepCelebrationModal = function() {
    const modal = document.getElementById('stepTrophyModal');
    if (modal) modal.classList.remove('active');
  };

  // 12. Filtre ve Görünüm Kontrolleri
  window.filterDrillItems = function(filterType, btn) {
    currentDrillFilter = filterType;
    document.querySelectorAll('#drillFilterGroup .tool-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderDrillItems();
  };

  window.switchDrillViewMode = function(mode) {
    currentViewMode = mode;
    document.querySelectorAll('#drillModeGroup .tool-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-drill-mode="${mode}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    renderDrillItems();
  };

  // 13. Flashcard (Büyük Odak Modu) Render
  function renderFlashcardView() {
    const fcView = document.getElementById('flashcardViewContainer');
    if (!fcView) return;

    const step = getStepData(currentActiveStep);
    if (!step || !step.items || step.items.length === 0) return;

    if (currentFlashcardIndex < 0) currentFlashcardIndex = 0;
    if (currentFlashcardIndex >= step.items.length) currentFlashcardIndex = step.items.length - 1;

    const it = step.items[currentFlashcardIndex];
    const isRead = readItemsSet.has(it.id);

    fcView.innerHTML = `
      <div class="flashcard-wrapper">
        <div class="big-flashcard ${isRead ? 'mastered' : ''}" id="bigFlashcardCard">
          <div class="fc-top">
            <span class="fc-counter">Kelime ${currentFlashcardIndex + 1} / ${step.items.length}</span>
            <span class="drill-status-tag">${isRead ? '✅ Başarıyla Okundu ⭐' : '⚪ Henüz Okunmadı'}</span>
          </div>
          <div class="fc-img-box" onclick="window.playDrillAudio('${it.audio}', this.closest('.big-flashcard'))" title="Dinlemek için tıkla">
            ${it.img ? `<img src="${it.img}" alt="${it.alt || 'Kelime'}" />` : `<div style="font-family:'Amiri'; font-size:4rem; color:#1e1b4b;">${it.alt}</div>`}
          </div>
          <div style="font-size: 0.9rem; color: #64748b; font-weight: 700; margin-bottom: 8px;">
            💡 Kartın üzerine veya "Sesi Dinle"ye bas, ardından yüksek sesle oku!
          </div>
          <div class="fc-nav-row">
            <button class="btn-fc-nav" onclick="window.navigateFlashcard(-1)" ${currentFlashcardIndex === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
              ⬅️ Önceki
            </button>
            <button class="btn-fc-nav" onclick="window.playDrillAudio('${it.audio}', document.getElementById('bigFlashcardCard'))" style="background:#eff6ff; border-color:#93c5fd; color:#1e40af;">
              🔊 Sesi Dinle
            </button>
            <button class="btn-fc-confirm" onclick="window.confirmFlashcardCurrent()">
              ${isRead ? '✓ Okundu' : '🗣️ Okudum! ✅'}
            </button>
            <button class="btn-fc-nav" onclick="window.navigateFlashcard(1)" ${currentFlashcardIndex === step.items.length - 1 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
              Sonraki ➡️
            </button>
          </div>
        </div>
      </div>
    `;

    // Otomatik sesi çal
    window.playDrillAudio(it.audio, document.getElementById('bigFlashcardCard'));
  }

  window.navigateFlashcard = function(dir) {
    currentFlashcardIndex += dir;
    renderFlashcardView();
  };

  window.confirmFlashcardCurrent = function() {
    const step = getStepData(currentActiveStep);
    if (!step || !step.items) return;
    const it = step.items[currentFlashcardIndex];
    if (!it) return;

    window.markItemAsRead(it.id, currentActiveStep, document.getElementById('bigFlashcardCard'));

    // 600ms sonra bir sonraki kelimeye geç
    setTimeout(() => {
      if (currentFlashcardIndex < step.items.length - 1) {
        window.navigateFlashcard(1);
      }
    }, 500);
  };

  // 14. Sürekli Tekrar Modu (Auto-Loop)
  function stopStepAutoLoop() {
    autoLoopActive = false;
    if (autoLoopTimer) {
      clearTimeout(autoLoopTimer);
      autoLoopTimer = null;
    }
  }

  window.toggleStepAutoLoop = function() {
    autoLoopActive = !autoLoopActive;
    const btn = document.getElementById('btnToggleAutoLoop');
    if (btn) {
      btn.textContent = autoLoopActive ? '⏸️ Otomatik Oynatmayı Duraklat' : '▶️ Sırayla Otomatik Oku & Dinle';
      btn.classList.toggle('active', autoLoopActive);
    }

    if (autoLoopActive) {
      runAutoLoopStep(0);
    } else {
      stopStepAutoLoop();
    }
  };

  function runAutoLoopStep(index) {
    if (!autoLoopActive) return;
    const step = getStepData(currentActiveStep);
    if (!step || !step.items || step.items.length === 0) return;

    if (index >= step.items.length) index = 0; // Başa dön

    const it = step.items[index];
    const card = document.getElementById(`card_${it.id}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    window.playDrillAudio(it.audio, card);

    autoLoopTimer = setTimeout(() => {
      runAutoLoopStep(index + 1);
    }, autoLoopSpeed);
  }

  // 15. Adım Sonu Testi (Mini Quiz)
  let quizQuestionIndex = 0;
  let quizCorrectCount = 0;
  let currentQuizTarget = null;

  function initStepQuiz() {
    quizQuestionIndex = 0;
    quizCorrectCount = 0;
    loadNextQuizQuestion();
  }

  function loadNextQuizQuestion() {
    const quizView = document.getElementById('stepQuizContainer');
    if (!quizView) return;

    const step = getStepData(currentActiveStep);
    if (!step || !step.items || step.items.length < 3) {
      quizView.innerHTML = '<p style="text-align:center;">Bu adım için yeterli kelime bulunamadı.</p>';
      return;
    }

    if (quizQuestionIndex >= 4) {
      // Test bitti
      quizView.innerHTML = `
        <div style="text-align:center; padding:30px; background:#f0fdf4; border-radius:20px; border:3px solid #86efac; max-width:550px; margin:0 auto;">
          <div style="font-size:3.5rem;">🎯 🏆</div>
          <h3 style="font-size:1.8rem; font-weight:900; color:#15803d; margin:8px 0;">Tebrikler! Testi Bitirdin!</h3>
          <p style="font-size:1.1rem; font-weight:800; color:#334155;">4 sorudan <strong>${quizCorrectCount}</strong> tanesini doğru bildin!</p>
          <div style="margin:16px 0;">⭐⭐⭐⭐⭐</div>
          <button class="tool-btn active" onclick="window.switchDrillViewMode('grid')" style="margin:0 auto; padding:12px 24px; font-size:1rem;">
            📋 Kelime Alıştırmalarına Dön
          </button>
        </div>
      `;
      if (quizCorrectCount === 4 && typeof window.addStars === 'function') {
        window.addStars(30);
        if (typeof window.triggerConfetti === 'function') window.triggerConfetti();
      }
      return;
    }

    // Hedef kelime seç
    const shuffled = [...step.items].sort(() => 0.5 - Math.random());
    currentQuizTarget = shuffled[0];

    // 3 seçenek
    const options = [currentQuizTarget, shuffled[1], shuffled[2]].sort(() => 0.5 - Math.random());

    quizView.innerHTML = `
      <div style="max-width:600px; margin:0 auto; text-align:center; padding:20px; background:#f8fafc; border-radius:20px; border:2px solid #e2e8f0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <span style="font-weight:900; color:#64748b;">Soru ${quizQuestionIndex + 1} / 4</span>
          <button class="tool-btn" onclick="window.playDrillAudio('${currentQuizTarget.audio}')" style="background:#eff6ff; color:#1e40af; border-color:#bfdbfe;">
            🔊 Sesi Tekrar Dinle
          </button>
        </div>
        <h3 style="font-size:1.3rem; font-weight:900; color:#0f172a; margin-bottom:18px;">
          Duyduğun ses hangi kelimeye ait? Tıkla ve bul!
        </h3>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:20px;">
          ${options.map(opt => `
            <div class="quiz-option-card" onclick="window.handleStepQuizChoice('${opt.id}', this)" style="background:white; border:2.5px solid #cbd5e1; border-radius:16px; padding:16px 10px; cursor:pointer; min-height:110px; display:flex; align-items:center; justify-content:center; transition:all 0.2s;">
              ${opt.img ? `<img src="${opt.img}" style="max-width:90%; max-height:80px; object-fit:contain;" />` : `<span style="font-family:'Amiri'; font-size:2.5rem;">${opt.alt}</span>`}
            </div>
          `).join('')}
        </div>
        <div id="quizFeedbackBox" style="min-height:30px; font-weight:900; font-size:1.1rem;"></div>
      </div>
    `;

    // Sesi hemen çal
    window.playDrillAudio(currentQuizTarget.audio);
  }

  window.handleStepQuizChoice = function(chosenId, elem) {
    const feedback = document.getElementById('quizFeedbackBox');
    if (chosenId === currentQuizTarget.id) {
      elem.style.borderColor = '#10b981';
      elem.style.background = '#f0fdf4';
      if (feedback) {
        feedback.innerHTML = '<span style="color:#10b981;">🎉 Harika! Doğru Bildin!</span>';
      }
      playCheerChime();
      quizCorrectCount++;
      quizQuestionIndex++;
      setTimeout(loadNextQuizQuestion, 1000);
    } else {
      elem.style.borderColor = '#ef4444';
      elem.style.background = '#fef2f2';
      if (feedback) {
        feedback.innerHTML = '<span style="color:#ef4444;">Tekrar dene! Sesi dinle.</span>';
      }
      window.playDrillAudio(currentQuizTarget.audio);
    }
  };

  // 16. Hızlı Adım Değiştirme
  window.navigateStep = function(direction) {
    const target = currentActiveStep + direction;
    if (target >= 1 && target <= 36) {
      window.loadStepDrills(target);
      const studio = document.getElementById('activeStepStudio');
      if (studio) studio.scrollIntoView({ behavior: 'smooth' });
    }
  };

  window.filterCurriculumCat = function(cat, btn) {
    window.currentCurriculumCat = cat;
    document.querySelectorAll('#curriculumCatFilter .filter-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderStepNavigator(cat);
  };

  // 17. İlerlemeyi Baştan Başlat
  window.confirmResetAllProgress = function() {
    const confirmed = confirm('Tüm okuma ilerlemeni ve işaretlerini sıfırlamak istiyor musun?');
    if (confirmed) {
      readItemsSet.clear();
      currentActiveStep = 1;
      saveProgress();
      window.loadStepDrills(1);
      renderMasteryDashboard();
      alert('Tüm ilerleme sıfırlandı. 1. Adımdan başarıyla başlayabilirsin!');
    }
  };

  window.resumeLastActiveStep = function() {
    window.loadStepDrills(currentActiveStep);
    const studio = document.getElementById('activeStepStudio');
    if (studio) studio.scrollIntoView({ behavior: 'smooth' });
  };

  // 18. Başlangıç (Init)
  window.initMasterySystem = function() {
    loadStoredProgress();
    renderMasteryDashboard();
    renderStepNavigator('all');
    window.loadStepDrills(currentActiveStep);
  };

  // DOM hazır olduğunda başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initMasterySystem);
  } else {
    window.initMasterySystem();
  }

})();
