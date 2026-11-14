/* =========================================================
   ÖĞRENCİ ÇALIŞTIRMA, TEST ETME VE ADIM GEÇİRME MOTORU
   - Kademeli kilit açma (Gated Progression)
   - 1. Aşama: Çalışma & Antrenman (Training Workout)
   - 2. Aşama: Öğrendin mi? Adım Geçme Testi (Audio Exam)
   - Yalnızca sınavı başarıyla geçen öğrenci bir sonraki adıma geçirilir!
   ========================================================= */

(function() {
  const STORAGE_KEY = 'elifba_gated_progression_v3';

  // Durum Değişkenleri
  let highestUnlockedStep = 1;
  let passedStepsSet = new Set();
  let trainedItemsSet = new Set();
  let teacherModeUnlocked = false;
  let currentActiveStep = 1;
  let currentPhase = 'train'; // 'train' veya 'exam'
  let currentDrillFilter = 'all'; // 'all', 'flashcard'
  let currentFlashcardIndex = 0;
  let activeAudioObj = null;

  // Sınav (Exam) Durum Değişkenleri
  let examQueue = [];
  let currentExamIndex = 0;
  let examCorrectCount = 0;
  let examTargetItem = null;
  let examCanAnswer = true;

  // 1. LocalStorage Yükleme & Kaydetme
  function loadStoredProgress() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (typeof data.highestUnlockedStep === 'number') {
          highestUnlockedStep = data.highestUnlockedStep;
        }
        if (Array.isArray(data.passedSteps)) {
          passedStepsSet = new Set(data.passedSteps);
        }
        if (Array.isArray(data.trainedItems)) {
          trainedItemsSet = new Set(data.trainedItems);
        }
        if (typeof data.teacherModeUnlocked === 'boolean') {
          teacherModeUnlocked = data.teacherModeUnlocked;
        }
        if (typeof data.lastActiveStep === 'number' && isStepUnlocked(data.lastActiveStep)) {
          currentActiveStep = data.lastActiveStep;
        } else {
          currentActiveStep = highestUnlockedStep;
        }
      }
    } catch (e) {
      console.warn('Progression load error:', e);
    }
  }

  function saveProgress() {
    try {
      const data = {
        highestUnlockedStep: highestUnlockedStep,
        passedSteps: Array.from(passedStepsSet),
        trainedItems: Array.from(trainedItemsSet),
        teacherModeUnlocked: teacherModeUnlocked,
        lastActiveStep: currentActiveStep,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Progression save error:', e);
    }
  }

  // 2. Kilit Kontrolleri
  function isStepUnlocked(stepNumber) {
    if (teacherModeUnlocked) return true;
    if (stepNumber === 1) return true;
    if (stepNumber <= highestUnlockedStep) return true;
    if (passedStepsSet.has(stepNumber - 1)) return true;
    return false;
  }

  function isStepPassed(stepNumber) {
    return passedStepsSet.has(stepNumber);
  }

  function getStepData(stepNumber) {
    if (!window.CURRICULUM_STEPS) return null;
    return window.CURRICULUM_STEPS.find(s => s.step === stepNumber) || window.CURRICULUM_STEPS[0];
  }

  function showLockedToast(stepNumber) {
    let toast = document.getElementById('lockedToastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'lockedToastNotification';
      toast.className = 'locked-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `🔒 <strong>Adım ${stepNumber} Kilitli!</strong> Önce Adım ${stepNumber - 1}'i çalışıp testini geçmelisin!`;
    toast.classList.add('show');
    playBoingSound();

    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // 3. Genel Başarı Paneli Render
  function renderMasteryDashboard() {
    const totalSteps = window.CURRICULUM_STEPS ? window.CURRICULUM_STEPS.length : 36;
    const passedCount = passedStepsSet.size;
    const percentage = Math.round((passedCount / totalSteps) * 100);

    const elRead = document.getElementById('totalReadCount');
    const elSteps = document.getElementById('totalMasteredSteps');
    const elStars = document.getElementById('totalStarsEarned');
    const elPercentText = document.getElementById('overallPercentageText');
    const elProgressBar = document.getElementById('overallProgressBar');
    const elResumeStep = document.getElementById('resumeStepLabel');

    if (elRead) elRead.textContent = `${trainedItemsSet.size} Kelime`;
    if (elSteps) elSteps.textContent = `${passedCount} / ${totalSteps}`;
    if (elStars) elStars.textContent = `⭐ ${passedCount * 50 + trainedItemsSet.size * 5}`;
    if (elPercentText) elPercentText.textContent = `%${percentage} Tamamlandı (${passedCount} Adım Geçildi)`;
    if (elProgressBar) elProgressBar.style.width = `${percentage}%`;

    const activeStepData = getStepData(currentActiveStep);
    if (elResumeStep && activeStepData) {
      elResumeStep.textContent = activeStepData.shortTitle || `Adım ${currentActiveStep}`;
    }

    const teacherBtn = document.getElementById('btnToggleTeacherMode');
    if (teacherBtn) {
      teacherBtn.textContent = teacherModeUnlocked ? '🔓 Veli Modu: Kilitler Açık' : '🔒 Kademeli Kilit Modu Aktif';
      teacherBtn.style.color = teacherModeUnlocked ? '#10b981' : '#cbd5e1';
    }
  }

  // 4. Adım Seçici Haritası (Kilitli & Açık Adımlar)
  function renderStepNavigator(categoryFilter) {
    const container = document.getElementById('stepChipsContainer');
    if (!container || !window.CURRICULUM_STEPS) return;
    container.innerHTML = '';

    let list = window.CURRICULUM_STEPS;
    if (categoryFilter && categoryFilter !== 'all') {
      list = list.filter(s => s.cat === categoryFilter);
    }

    list.forEach(step => {
      const unlocked = isStepUnlocked(step.step);
      const passed = isStepPassed(step.step);
      const active = (step.step === currentActiveStep);

      const card = document.createElement('div');
      let statusClass = 'locked';
      let badgeHtml = '<span class="badge-locked">🔒 Kilitli</span>';

      if (passed) {
        statusClass = 'passed';
        badgeHtml = '<span class="badge-passed">👑 Geçildi</span>';
      } else if (unlocked) {
        statusClass = (active ? 'unlocked-current active' : 'unlocked');
        badgeHtml = '<span class="badge-current">🟢 Açık</span>';
      }

      card.className = `step-chip-card ${statusClass} ${active ? 'active' : ''}`;

      card.onclick = () => {
        if (!isStepUnlocked(step.step)) {
          card.style.animation = 'shakeCard 0.4s ease-in-out';
          setTimeout(() => { card.style.animation = ''; }, 400);
          showLockedToast(step.step);
          return;
        }
        window.loadStepDrills(step.step);
      };

      const stepPrefix = step.isDua ? `Dua ${step.step - 28}` : `Adım ${step.step}`;
      const total = step.itemCount || step.items.length;

      card.innerHTML = `
        <div class="step-chip-header">
          <span class="step-chip-num">${stepPrefix}</span>
          ${badgeHtml}
        </div>
        <div class="step-chip-title" title="${step.title}">${step.shortTitle || step.title}</div>
        <div style="font-size:0.75rem; color:#64748b; font-weight:700;">${total} Alıştırma</div>
      `;
      container.appendChild(card);
    });
  }

  // 5. Adım Yükleme (Çalışma Alanı)
  window.loadStepDrills = function(stepNumber) {
    if (!isStepUnlocked(stepNumber)) {
      showLockedToast(stepNumber);
      return;
    }

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

    // Varsayılan olarak Antrenman modunu aç
    window.switchStepPhase('train');

    updateActiveStepTrainingBar();
    renderStepNavigator(window.currentCurriculumCat || 'all');
    renderMasteryDashboard();
  };

  // 6. Faz Değiştirici: 1. Çalışma & Antrenman vs 2. Sınav & Test (REKÜRSİYONSUZ)
  window.switchStepPhase = function(phase) {
    currentPhase = phase;

    const btnTrain = document.getElementById('btnPhaseTrain');
    const btnExam = document.getElementById('btnPhaseExam');
    const trainArea = document.getElementById('trainingPhaseArea');
    const examArea = document.getElementById('examPhaseArea');

    if (btnTrain) btnTrain.classList.toggle('active', phase === 'train');
    if (btnExam) {
      btnExam.classList.toggle('active', phase === 'exam');
      btnExam.classList.toggle('test-phase', phase === 'exam');
    }

    if (phase === 'train') {
      if (trainArea) trainArea.style.display = 'block';
      if (examArea) examArea.style.display = 'none';
      renderDrillItems();
    } else {
      if (trainArea) trainArea.style.display = 'none';
      if (examArea) examArea.style.display = 'block';
      startExamEngine();
    }
  };

  // Sınava Başla Butonu Tıklanınca
  window.startStepExam = function() {
    window.switchStepPhase('exam');
  };

  function updateActiveStepTrainingBar() {
    const step = getStepData(currentActiveStep);
    if (!step || !step.items) return;

    let trainedCount = 0;
    step.items.forEach(it => {
      if (trainedItemsSet.has(it.id)) trainedCount++;
    });

    const total = step.items.length;
    const percent = Math.round((trainedCount / total) * 100);
    const passed = isStepPassed(step.step);

    const elCount = document.getElementById('studioMasteryCount');
    const elFill = document.getElementById('studioMasteryFill');
    const elMsg = document.getElementById('studioMotivateMsg');

    if (elCount) elCount.textContent = `${trainedCount} / ${total} Kelime Çalışıldı (%${percent})`;
    if (elFill) elFill.style.width = `${percent}%`;

    if (elMsg) {
      if (passed) {
        elMsg.className = 'mastery-motivate-msg complete';
        elMsg.innerHTML = '👑 <strong>BU ADIM GEÇİLDİ!</strong> Sınavı başarıyla geçtin ve sonraki adımın kilidini açtın!';
      } else if (trainedCount === total) {
        elMsg.className = 'mastery-motivate-msg complete';
        elMsg.innerHTML = '🎉 <strong>Tüm Kelimeleri Çalıştın!</strong> Şimdi aşağıdaki "Sınava Başla" butonuna bas ve adımı geç!';
      } else {
        elMsg.className = 'mastery-motivate-msg incomplete';
        elMsg.innerHTML = `🏋️ <strong>Öğrenciyi Çalıştırma:</strong> Kelimeleri dinle, tekrar et ve "Çalıştım"a bas. Ardından sınava girerek sonraki adımı aç!`;
      }
    }
  }

  // 7. Çalışma Maddeleri Grid Render
  function renderDrillItems() {
    const grid = document.getElementById('drillItemsGrid');
    const fcView = document.getElementById('flashcardViewContainer');
    if (!grid) return;

    if (currentDrillFilter === 'flashcard') {
      grid.style.display = 'none';
      if (fcView) {
        fcView.style.display = 'flex';
        renderFlashcardView();
      }
      return;
    }

    if (fcView) fcView.style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = '';

    const step = getStepData(currentActiveStep);
    if (!step || !step.items) return;

    step.items.forEach(it => {
      const isTrained = trainedItemsSet.has(it.id);
      const card = document.createElement('div');
      card.className = `drill-card ${isTrained ? 'mastered' : ''}`;
      card.id = `card_${it.id}`;

      card.onclick = () => {
        window.playDrillAudio(it.audio, card);
      };

      card.innerHTML = `
        <div class="drill-card-top">
          <span class="drill-item-num">#${it.num}</span>
          <span class="drill-status-tag">${isTrained ? '✓ Çalışıldı' : '⚪ Bekliyor'}</span>
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
          <button class="btn-drill-confirm" onclick="window.markItemAsTrained('${it.id}', this.closest('.drill-card'))">
            ${isTrained ? '✓ Tekrar Dinle' : '🗣️ Çalıştım'}
          </button>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  // 8. Kelimeyi Çalışıldı Olarak İşaretleme
  window.markItemAsTrained = function(itemId, cardElement) {
    trainedItemsSet.add(itemId);
    saveProgress();

    if (cardElement) {
      cardElement.classList.add('mastered');
      const tag = cardElement.querySelector('.drill-status-tag');
      if (tag) tag.textContent = '✓ Çalışıldı';
    }

    playCheerChime();
    updateActiveStepTrainingBar();
    renderMasteryDashboard();
  };

  // 9. Sesi Çalma
  window.playDrillAudio = function(audioPath, cardElement) {
    if (!audioPath) return;

    if (activeAudioObj) {
      activeAudioObj.pause();
      activeAudioObj.currentTime = 0;
    }

    document.querySelectorAll('.drill-card.playing').forEach(c => c.classList.remove('playing'));
    if (cardElement) cardElement.classList.add('playing');

    activeAudioObj = new Audio(audioPath);
    activeAudioObj.play().catch(e => console.log('Audio error:', e));

    activeAudioObj.onended = () => {
      if (cardElement) cardElement.classList.remove('playing');
    };
  };

  // 10. Flashcard Modu
  function renderFlashcardView() {
    const fcView = document.getElementById('flashcardViewContainer');
    if (!fcView) return;

    const step = getStepData(currentActiveStep);
    if (!step || !step.items || step.items.length === 0) return;

    if (currentFlashcardIndex < 0) currentFlashcardIndex = 0;
    if (currentFlashcardIndex >= step.items.length) currentFlashcardIndex = step.items.length - 1;

    const it = step.items[currentFlashcardIndex];
    const isTrained = trainedItemsSet.has(it.id);

    fcView.innerHTML = `
      <div class="flashcard-wrapper">
        <div class="big-flashcard ${isTrained ? 'mastered' : ''}" id="bigFlashcardCard">
          <div class="fc-top">
            <span class="fc-counter">Kelime ${currentFlashcardIndex + 1} / ${step.items.length}</span>
            <span class="drill-status-tag">${isTrained ? '✓ Çalışıldı' : '⚪ Bekliyor'}</span>
          </div>
          <div class="fc-img-box" onclick="window.playDrillAudio('${it.audio}', document.getElementById('bigFlashcardCard'))" title="Dinlemek için tıkla">
            ${it.img ? `<img src="${it.img}" alt="${it.alt || 'Kelime'}" />` : `<div style="font-family:'Amiri'; font-size:4rem; color:#1e1b4b;">${it.alt}</div>`}
          </div>
          <div style="font-size: 0.95rem; color: #64748b; font-weight: 800; margin-bottom: 8px;">
            💡 Kartın üzerine veya "Sesi Dinle"ye bas, ardından yüksek sesle tekrar et!
          </div>
          <div class="fc-nav-row">
            <button class="btn-fc-nav" onclick="window.navigateFlashcard(-1)" ${currentFlashcardIndex === 0 ? 'disabled style="opacity:0.5;"' : ''}>
              ⬅️ Önceki
            </button>
            <button class="btn-fc-nav" onclick="window.playDrillAudio('${it.audio}', document.getElementById('bigFlashcardCard'))" style="background:#eff6ff; border-color:#93c5fd; color:#1e40af;">
              🔊 Sesi Dinle
            </button>
            <button class="btn-fc-confirm" onclick="window.confirmFlashcardCurrent()">
              ${isTrained ? '✓ Sıradaki' : '🗣️ Çalıştım! ✅'}
            </button>
            <button class="btn-fc-nav" onclick="window.navigateFlashcard(1)" ${currentFlashcardIndex === step.items.length - 1 ? 'disabled style="opacity:0.5;"' : ''}>
              Sonraki ➡️
            </button>
          </div>
        </div>
      </div>
    `;

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
    if (it) {
      window.markItemAsTrained(it.id, document.getElementById('bigFlashcardCard'));
    }
    if (currentFlashcardIndex < step.items.length - 1) {
      window.navigateFlashcard(1);
    }
  };

  // 11. ADIM GEÇME SINAVI MOTORU (START EXAM ENGINE)
  // KESİNLİKLE 4'LÜ SÜTUN DÜZENİ, YANLIŞLAR KAPANMAZ & HER HARF 3 KEZ SORULUR
  let examConsecutiveWrong = 0;
  let examItemHits = {};
  const EXAM_REQUIRED_HITS = 3; // Her harf ve kelime 3 kez sorulup tamamlanır

  function startExamEngine() {
    const step = getStepData(currentActiveStep);
    if (!step || !step.items || step.items.length === 0) return;

    // Her maddeyi 3 kez sorulacak şekilde havuza ekle ve karıştır
    examItemHits = {};
    step.items.forEach(it => { examItemHits[it.id] = 0; });

    examQueue = [];
    for (let r = 0; r < EXAM_REQUIRED_HITS; r++) {
      examQueue.push(...[...step.items].sort(() => 0.5 - Math.random()));
    }

    currentExamIndex = 0;
    examCorrectCount = 0;
    examCanAnswer = true;
    examConsecutiveWrong = 0;

    loadExamQuestion();
  }

  function loadExamQuestion() {
    examCanAnswer = true;
    examConsecutiveWrong = 0;

    const examArea = document.getElementById('examPhaseArea');
    if (!examArea) return;

    const step = getStepData(currentActiveStep);

    // Henüz 3 kez bilinmemiş hedefleri filtrele
    const unmastered = examQueue.filter(it => (examItemHits[it.id] || 0) < EXAM_REQUIRED_HITS);

    if (unmastered.length === 0) {
      // SINAV BİTTİ! TÜM HARFLER 3'ER KEZ BAŞARIYLA GEÇİLDİ!
      handleExamSuccess();
      return;
    }

    // Aynı soruyu üst üste getirmemeye çalış
    let chosen = unmastered[0];
    if (unmastered.length > 1 && examTargetItem && unmastered[0].id === examTargetItem.id) {
      const alt = unmastered.find(i => i.id !== examTargetItem.id);
      if (alt) chosen = alt;
    }

    examTargetItem = chosen;
    const qIdx = examQueue.indexOf(examTargetItem);
    if (qIdx !== -1) examQueue.splice(qIdx, 1);

    // SIRAYLA TIKLAMAYI ÖNLEMEK İÇİN KARTLAR TAHTAYA KARIŞIK DİZİLİR
    let choices = [...step.items].sort(() => 0.5 - Math.random());

    const totalTargetHits = step.items.length * EXAM_REQUIRED_HITS;
    let totalCompletedHits = 0;
    let completedItemsCount = 0;
    Object.values(examItemHits).forEach(h => {
      const capped = Math.min(EXAM_REQUIRED_HITS, h);
      totalCompletedHits += capped;
      if (capped >= EXAM_REQUIRED_HITS) completedItemsCount++;
    });

    examArea.innerHTML = `
      <div class="exam-room-container">
        <div class="exam-header-bar">
          <span class="exam-question-badge">📝 ${totalCompletedHits} / ${totalTargetHits} Doğru (3 Tekrar Kuralı)</span>
          <span class="exam-score-tracker">⭐ Tamamlanan: ${completedItemsCount} / ${step.items.length} Harf (3x)</span>
        </div>

        <div class="exam-audio-hero">
          <button class="btn-exam-speaker pulse-anim" id="btnExamSpeaker" onclick="window.playExamAudio()" title="Sesi Tekrar Çal (Boşluk Tuşu)">
            🔊
          </button>
          <div class="exam-prompt-title">Duyduğun ses hangi kelime/harf?</div>
          <div class="exam-prompt-sub">Hoparlörden gelen sesi dinle, aşağıdaki 4'lü sütun seçenekler arasından doğru olanı bul!</div>
        </div>

        <div style="margin: 12px auto 6px auto; max-width: 960px; font-weight: 800; font-size: 0.95rem; color: #475569; display: flex; justify-content: space-between; align-items: center; direction: rtl; flex-wrap: wrap; gap: 8px;">
          <span>📋 4'lü Sütun Seçenek Tablosu (Boşluksuz):</span>
          <span style="font-size: 0.85rem; color: #92400e; background: #fef3c7; border: 1px solid #fde68a; padding: 2px 10px; border-radius: 999px;">⭐ Her Harf 3 Kez Sorulur & Yanlışlar Kapanmaz</span>
        </div>

        <div class="exam-choices-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0px; direction: rtl; max-width: 960px; margin: 14px auto;">
          ${choices.map((c) => {
            const hits = examItemHits[c.id] || 0;
            const isSolved = hits >= EXAM_REQUIRED_HITS;
            let starText = '';
            if (isSolved) starText = '⭐⭐⭐ ✓';
            else if (hits === 2) starText = '⭐⭐ (2/3)';
            else if (hits === 1) starText = '⭐ (1/3)';

            return `
              <div class="exam-choice-card ${isSolved ? 'correct-answer' : ''}" id="exam_card_${c.id}" data-id="${c.id}" onclick="window.submitExamAnswer('${c.id}', this)">
                ${starText ? `<span class="card-stars-badge" style="position:absolute; top:4px; right:4px; font-size:0.72rem; font-weight:900; background:${isSolved ? '#22c55e' : '#fef3c7'}; color:${isSolved ? '#fff' : '#92400e'}; border:1px solid ${isSolved ? '#16a34a' : '#fde68a'}; padding:1px 5px; border-radius:999px; z-index:2;">${starText}</span>` : ''}
                ${c.img ? `<img src="${c.img}" alt="${c.alt || 'Seçenek'}" />` : `<span style="font-family:'Amiri'; font-size:3.8rem; font-weight:700;">${c.alt}</span>`}
              </div>
            `;
          }).join('')}
        </div>

        <div class="exam-feedback-banner" id="examFeedbackBanner" style="margin-top:14px;">
          <span style="color:#64748b;">Hoparlördeki sesi dinle ve 4 sütunlu kartlardan doğru olanı işaretle...</span>
        </div>
      </div>
    `;

    // Sesi hemen çal
    setTimeout(window.playExamAudio, 350);
  }

  window.playExamAudio = function() {
    if (!examTargetItem) return;
    const speakerBtn = document.getElementById('btnExamSpeaker');
    if (speakerBtn) speakerBtn.classList.add('pulse-anim');

    if (activeAudioObj) {
      activeAudioObj.pause();
      activeAudioObj.currentTime = 0;
    }

    activeAudioObj = new Audio(examTargetItem.audio);
    activeAudioObj.play().catch(e => console.log('Audio error:', e));
    activeAudioObj.onended = () => {
      if (speakerBtn) speakerBtn.classList.remove('pulse-anim');
    };
  };

  window.submitExamAnswer = function(chosenId, choiceCard) {
    if (!examCanAnswer) return;

    // 3 kez tamamlanmış karta basılırsa sadece ses çalsın
    if ((examItemHits[chosenId] || 0) >= EXAM_REQUIRED_HITS) {
      const snd = new Audio(examTargetItem.audio);
      snd.play().catch(() => {});
      return;
    }

    const feedback = document.getElementById('examFeedbackBanner');
    const grid = document.querySelector('.exam-choices-grid');

    if (chosenId === examTargetItem.id) {
      // DOĞRU CEVAP!
      examCanAnswer = false;
      choiceCard.classList.add('correct-answer');
      playCheerChime();
      if (typeof window.triggerConfetti === 'function') {
        window.triggerConfetti();
      }

      const currentHits = (examItemHits[chosenId] || 0) + 1;
      examItemHits[chosenId] = currentHits;

      if (currentHits >= EXAM_REQUIRED_HITS) {
        if (feedback) {
          feedback.innerHTML = `<span style="color:#10b981; font-weight:900;">🏆 MAŞALLAH! Bu harf 3 kez doğru bilinerek tamamlandı! (3/3) 👏</span>`;
        }
      } else {
        if (feedback) {
          feedback.innerHTML = `<span style="color:#10b981; font-weight:900;">🎉 HARİKA! ${currentHits}. tekrar tamamlandı (${currentHits}/3). Sıradaki ses geliyor...</span>`;
        }
      }

      // 800ms sonra bir sonraki soruya geç
      setTimeout(() => {
        loadExamQuestion();
      }, 800);

    } else {
      // YANLIŞ CEVAP! (YANLIŞLAR ASLA KAPANMAZ!)
      examCanAnswer = false; // Hızlı tıklamayı önlemek için kısa süreli kilit
      examConsecutiveWrong++;

      // Kart sallansın ama KAPANMASIN (kart açık kalır!)
      choiceCard.classList.add('wrong-answer');
      setTimeout(() => {
        choiceCard.classList.remove('wrong-answer');
      }, 500);

      playBoingSound();

      if (grid) grid.classList.add('grid-locked');

      if (examConsecutiveWrong >= 3) {
        if (feedback) {
          feedback.innerHTML = '<span style="color:#ef4444; font-weight:800;">⚠️ <strong>Sesi dinle!</strong> Ezbere tıklama, sesi dinleyip öyle bul 🎧 (Kartlar karıştırılıyor...)</span>';
        }
        setTimeout(() => {
          loadExamQuestion();
        }, 800);
      } else {
        if (feedback) {
          feedback.innerHTML = '<span style="color:#ef4444; font-weight:800;">🤔 <strong>Yanlış kart!</strong> Kartlar açık kalıyor, sesi bir daha dinle ve doğru olanı seç...</span>';
        }
      }

      // Yanlış bilinen soruyu tekrar sorulmak üzere kuyruğa ekle
      examQueue.push(examTargetItem);

      // Doğru sesi tekrar dinlet
      setTimeout(() => {
        window.playExamAudio();
      }, 300);

      // 1.2 saniye sonra tahta kilidini aç (öğrenci tekrar deneyebilir, KARTLAR KAPANMAZ!)
      setTimeout(() => {
        if (grid) grid.classList.remove('grid-locked');
        examCanAnswer = true;
      }, 1200);
    }
  };

  // 12. SINAVI BAŞARIYLA GEÇME & BİR SONRAKİ ADIMI AÇMA TÖRENİ!
  function handleExamSuccess() {
    const step = getStepData(currentActiveStep);
    if (!step) return;

    // Bu adımı GEÇİLDİ olarak kaydet
    passedStepsSet.add(step.step);

    // Bir sonraki adımın KİLİDİNİ AÇ!
    const nextStepNum = step.step + 1;
    if (nextStepNum > highestUnlockedStep) {
      highestUnlockedStep = nextStepNum;
    }

    saveProgress();
    playTriumphantFanfare();

    if (typeof window.triggerConfetti === 'function') {
      window.triggerConfetti();
      setTimeout(window.triggerConfetti, 400);
      setTimeout(window.triggerConfetti, 800);
    }

    // Modal Bilgilerini Doldur
    const modal = document.getElementById('levelUpModal');
    const title = document.getElementById('levelUpTitle');
    const desc = document.getElementById('levelUpDesc');
    const nextBox = document.getElementById('levelUpNextStepBox');
    const btnAdvance = document.getElementById('btnLevelUpAdvance');

    const nextStepData = getStepData(nextStepNum);

    if (title) title.textContent = `🎉 MAŞALLAH! ${step.title} Geçildi!`;
    if (desc) desc.textContent = `Öğrenip öğrenmediğin test edildi ve tüm soruları başarıyla cevapladın! Bir sonraki adımın kilidi açıldı! 👑 ⭐⭐⭐`;

    if (nextBox && nextStepData) {
      nextBox.style.display = 'flex';
      nextBox.innerHTML = `🔓 <strong>YENİ AÇILAN ADIM:</strong> ${nextStepData.title}`;
    } else if (nextBox) {
      nextBox.innerHTML = `🏆 <strong>TEBRİKLER!</strong> Tüm Elifba derslerini ve adımlarını bitirdin!`;
    }

    if (btnAdvance) {
      if (nextStepData) {
        btnAdvance.textContent = `🚀 Adım ${nextStepNum}'e Başla! ➡️`;
        btnAdvance.onclick = () => {
          modal.classList.remove('active');
          window.loadStepDrills(nextStepNum);
          document.getElementById('activeStepStudio').scrollIntoView({ behavior: 'smooth' });
        };
      } else {
        btnAdvance.textContent = `🎓 Başa Dön ve Tebrikleri Kabul Et!`;
        btnAdvance.onclick = () => { modal.classList.remove('active'); };
      }
    }

    if (modal) modal.classList.add('active');

    renderMasteryDashboard();
    renderStepNavigator(window.currentCurriculumCat || 'all');
  }

  // 13. Ses Efektleri (Web Audio API Synthesizer)
  function playCheerChime() {
    try {
      const ctx = window.getAudioContext ? window.getAudioContext() : new (window.AudioContext || window.webkitAudioContext)();
      if (!ctx) return;
      const now = ctx.currentTime;
      [1046.50, 1318.51, 1567.98].forEach((freq, idx) => {
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
    } catch (e) {}
  }

  function playBoingSound() {
    try {
      const ctx = window.getAudioContext ? window.getAudioContext() : new (window.AudioContext || window.webkitAudioContext)();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.25);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    } catch (e) {}
  }

  function playTriumphantFanfare() {
    try {
      const ctx = window.getAudioContext ? window.getAudioContext() : new (window.AudioContext || window.webkitAudioContext)();
      if (!ctx) return;
      const now = ctx.currentTime;
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
    } catch (e) {}
  }

  // 14. Öğretmen / Veli Modu (Tüm Kilitleri Açma Seçeneği)
  window.toggleTeacherMode = function() {
    teacherModeUnlocked = !teacherModeUnlocked;
    saveProgress();
    renderMasteryDashboard();
    renderStepNavigator(window.currentCurriculumCat || 'all');
    alert(teacherModeUnlocked ? '🔓 Veli / Öğretmen Modu Açıldı: İstediğiniz adıma serbestçe tıklayabilirsiniz.' : '🔒 Kademeli Kilit Modu Devrede: Adımlar sınavla geçilerek açılır.');
  };

  // 15. Yardımcı Butonlar
  window.navigateStep = function(direction) {
    const target = currentActiveStep + direction;
    if (target >= 1 && target <= 36) {
      if (!isStepUnlocked(target)) {
        showLockedToast(target);
        return;
      }
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

  window.filterDrillItems = function(filterType, btn) {
    currentDrillFilter = filterType;
    document.querySelectorAll('#drillFilterGroup .tool-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderDrillItems();
  };

  window.confirmResetAllProgress = function() {
    const confirmed = confirm('Tüm okuma ve sınav ilerlemenizi sıfırlayıp 1. Adımdan tekrar başlamak istiyor musunuz?');
    if (confirmed) {
      highestUnlockedStep = 1;
      passedStepsSet.clear();
      trainedItemsSet.clear();
      currentActiveStep = 1;
      saveProgress();
      window.loadStepDrills(1);
      renderMasteryDashboard();
      alert('Tüm kilitler ve ilerleme sıfırlandı. 1. Adım hazır!');
    }
  };

  window.resumeLastActiveStep = function() {
    window.loadStepDrills(currentActiveStep);
    const studio = document.getElementById('activeStepStudio');
    if (studio) studio.scrollIntoView({ behavior: 'smooth' });
  };

  // 16. Başlangıç (Init)
  window.initMasterySystem = function() {
    loadStoredProgress();
    renderMasteryDashboard();
    renderStepNavigator('all');
    window.loadStepDrills(currentActiveStep);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initMasterySystem);
  } else {
    window.initMasterySystem();
  }

})();
