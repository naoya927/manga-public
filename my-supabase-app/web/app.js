import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let config = window.APP_CONFIG || {};

const refs = {
    setupPanel: document.getElementById('setup-panel'),
    authCard: document.getElementById('auth-card'),
    authEmail: document.getElementById('auth-email'),
    authPassword: document.getElementById('auth-password'),
    signInButton: document.getElementById('sign-in-button'),
    signUpButton: document.getElementById('sign-up-button'),
    resendConfirmationButton: document.getElementById('resend-confirmation-button'),
    signOutButton: document.getElementById('sign-out-button'),
    authStatus: document.getElementById('auth-status'),
    refreshButton: document.getElementById('refresh-button'),
    appShell: document.getElementById('app-shell'),
    sessionEmail: document.getElementById('session-email'),
    statRecords: document.getElementById('stat-records'),
    statFavorites: document.getElementById('stat-favorites'),
    statReadingDays: document.getElementById('stat-reading-days'),
    statMonthCount: document.getElementById('stat-month-count'),
    recordFormHeading: document.getElementById('record-form-heading'),
    cancelEditButton: document.getElementById('cancel-edit-button'),
    recordForm: document.getElementById('record-form'),
    recordTitle: document.getElementById('record-title'),
    recordTitleReading: document.getElementById('record-title-reading'),
    recordQuote: document.getElementById('record-quote'),
    recordQuoteSpeaker: document.getElementById('record-quote-speaker'),
    recordThoughts: document.getElementById('record-thoughts'),
    recordTag: document.getElementById('record-tag'),
    recordSummary: document.getElementById('record-summary'),
    recordFavorite: document.getElementById('record-favorite'),
    recordSubmitButton: document.getElementById('record-submit-button'),
    recordResetButton: document.getElementById('record-reset-button'),
    recordCoverInput: document.getElementById('record-cover-input'),
    recordGalleryInput: document.getElementById('record-gallery-input'),
    removeCoverButton: document.getElementById('remove-cover-button'),
    coverPreview: document.getElementById('cover-preview'),
    galleryPreviewGrid: document.getElementById('gallery-preview-grid'),
    recordSearch: document.getElementById('record-search'),
    recordsGrid: document.getElementById('records-grid'),
    favoritesGrid: document.getElementById('favorites-grid'),
    tabButtons: Array.from(document.querySelectorAll('.tab-button')),
    tabPanels: Array.from(document.querySelectorAll('.tab-panel')),
    calendarMonthLabel: document.getElementById('calendar-month-label'),
    calendarSelectedDateLabel: document.getElementById('calendar-selected-date-label'),
    calendarGrid: document.getElementById('calendar-grid'),
    calendarPrevButton: document.getElementById('calendar-prev-button'),
    calendarTodayButton: document.getElementById('calendar-today-button'),
    calendarNextButton: document.getElementById('calendar-next-button'),
    calendarFormHeading: document.getElementById('calendar-form-heading'),
    cancelLogEditButton: document.getElementById('cancel-log-edit-button'),
    calendarForm: document.getElementById('calendar-form'),
    calendarDate: document.getElementById('calendar-date'),
    calendarTitle: document.getElementById('calendar-title'),
    calendarVolumeStart: document.getElementById('calendar-volume-start'),
    calendarVolumeEnd: document.getElementById('calendar-volume-end'),
    calendarSubmitButton: document.getElementById('calendar-submit-button'),
    calendarResetButton: document.getElementById('calendar-reset-button'),
    titleSuggestions: document.getElementById('title-suggestions'),
    selectedLogsHeading: document.getElementById('selected-logs-heading'),
    dailyLogList: document.getElementById('daily-log-list'),
    toast: document.getElementById('toast')
};

const state = {
    supabase: null,
    session: null,
    activeTab: 'create',
    records: [],
    readingLogs: [],
    recordEditor: createEmptyRecordEditor(),
    calendarCursor: new Date(),
    selectedDate: toDateInputValue(new Date()),
    calendarEditingId: null,
    toastTimer: null
};

function createEmptyRecordEditor() {
    return {
        editingId: null,
        existingCoverPath: '',
        existingCoverUrl: '',
        removeCover: false,
        existingGallery: [],
        removedGalleryIds: new Set(),
        pendingCoverFile: null,
        pendingGalleryFiles: []
    };
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character] || character));
}

function normalizeKana(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
        .replace(/\s+/g, '');
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }
    return new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(new Date(value));
}

function formatMonthLabel(date) {
    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long'
    }).format(date);
}

function formatSelectedDate(value) {
    if (!value) {
        return '日付未選択';
    }
    return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short'
    }).format(new Date(`${value}T00:00:00`));
}

function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function uniqueTitles() {
    const seen = new Set();
    return state.records
        .map((record) => record.title)
        .filter((title) => {
            if (seen.has(title)) {
                return false;
            }
            seen.add(title);
            return true;
        });
}

function setLoading(button, isLoading, defaultLabel, loadingLabel) {
    if (!button) {
        return;
    }
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingLabel : defaultLabel;
}

function showToast(message, duration = 2600) {
    refs.toast.hidden = false;
    refs.toast.textContent = message;
    if (state.toastTimer) {
        window.clearTimeout(state.toastTimer);
    }
    state.toastTimer = window.setTimeout(() => {
        refs.toast.hidden = true;
    }, duration);
}

function setAuthStatus(message = '', tone = 'info') {
    if (!refs.authStatus) {
        return;
    }

    refs.authStatus.hidden = !message;
    refs.authStatus.textContent = message;
    refs.authStatus.className = 'auth-status';

    if (tone === 'warning' || tone === 'error') {
        refs.authStatus.classList.add(tone);
    }
}

async function loadConfigFromJson() {
    try {
        const response = await fetch('./config.json', { cache: 'no-store' });
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        return data;
    } catch (_error) {
        return null;
    }
}

async function loadConfigFromJs() {
    try {
        const response = await fetch('./config.js', { cache: 'no-store' });
        if (!response.ok) {
            return null;
        }
        const text = await response.text();
        const matched = text.match(/Object\.freeze\(([\s\S]*?)\);?\s*$/);
        if (!matched?.[1]) {
            return null;
        }
        return JSON.parse(matched[1]);
    } catch (_error) {
        return null;
    }
}

async function loadAppConfig() {
    if (window.APP_CONFIG?.supabaseUrl && window.APP_CONFIG?.supabaseAnonKey) {
        config = window.APP_CONFIG;
        return config;
    }

    const jsonConfig = await loadConfigFromJson();
    if (jsonConfig?.supabaseUrl && jsonConfig?.supabaseAnonKey) {
        window.APP_CONFIG = jsonConfig;
        config = jsonConfig;
        return config;
    }

    const jsConfig = await loadConfigFromJs();
    if (jsConfig?.supabaseUrl && jsConfig?.supabaseAnonKey) {
        window.APP_CONFIG = jsConfig;
        config = jsConfig;
        return config;
    }

    config = window.APP_CONFIG || {};
    return config;
}

function switchTab(nextTab) {
    state.activeTab = nextTab;
    refs.tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === nextTab);
    });
    refs.tabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.panel === nextTab);
    });
}

function ensureSupabaseConfigured() {
    const missing = [];
    if (!config.supabaseUrl) {
        missing.push('NEXT_PUBLIC_SUPABASE_URL');
    }
    if (!config.supabaseAnonKey) {
        missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    if (missing.length > 0) {
        refs.setupPanel.hidden = false;
        refs.authCard.hidden = true;
        refs.appShell.hidden = true;
        setAuthStatus(`不足している設定: ${missing.join(', ')}`, 'warning');
        return false;
    }
    refs.setupPanel.hidden = true;
    return true;
}

async function initializeSupabase() {
    await loadAppConfig();

    if (!ensureSupabaseConfigured()) {
        return;
    }

    state.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

    const { data, error } = await state.supabase.auth.getSession();
    if (error) {
        showToast(error.message);
        return;
    }

    await applySession(data.session);

    state.supabase.auth.onAuthStateChange((_event, session) => {
        void applySession(session);
    });
}

async function applySession(session) {
    state.session = session;
    refs.setupPanel.hidden = true;

    if (!session?.user) {
        refs.authCard.hidden = false;
        refs.appShell.hidden = true;
        refs.sessionEmail.textContent = '未ログイン';
        state.records = [];
        state.readingLogs = [];
        renderAll();
        return;
    }

    refs.authCard.hidden = true;
    refs.appShell.hidden = false;
    refs.sessionEmail.textContent = session.user.email || 'ログイン中';
    await refreshAllData();
}

async function signIn() {
    const email = refs.authEmail.value.trim();
    const password = refs.authPassword.value;
    if (!email || !password) {
        showToast('メールアドレスとパスワードを入力してください。');
        return;
    }

    setLoading(refs.signInButton, true, 'ログイン', 'ログイン中...');
    try {
        const { error } = await state.supabase.auth.signInWithPassword({ email, password });
        if (error) {
            throw error;
        }
        setAuthStatus('');
        showToast('ログインしました。');
    } catch (error) {
        const message = error?.message || 'ログインに失敗しました。';
        if (message.toLowerCase().includes('email not confirmed')) {
            setAuthStatus('メール確認がまだ完了していません。確認メールを開くか、「確認メールを再送」を押してください。', 'warning');
        } else {
            setAuthStatus(message, 'error');
        }
        showToast(error.message || 'ログインに失敗しました。');
    } finally {
        setLoading(refs.signInButton, false, 'ログイン', 'ログイン中...');
    }
}

async function signUp() {
    const email = refs.authEmail.value.trim();
    const password = refs.authPassword.value;
    if (!email || !password) {
        showToast('メールアドレスとパスワードを入力してください。');
        return;
    }

    setLoading(refs.signUpButton, true, '新規登録', '登録中...');
    try {
        const { data, error } = await state.supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin
            }
        });
        if (error) {
            throw error;
        }
        if (!data.session) {
            setAuthStatus('アカウントを作成しました。Supabase の Email Confirm が有効な場合は確認メールが送られます。届かないときは迷惑メールと Supabase Auth 設定を確認してください。', 'warning');
            showToast('確認メールを送信しました。メール確認後にログインしてください。', 4200);
        } else {
            setAuthStatus('アカウントを作成してログインしました。');
            showToast('アカウントを作成しました。');
        }
    } catch (error) {
        setAuthStatus(error.message || '新規登録に失敗しました。', 'error');
        showToast(error.message || '新規登録に失敗しました。');
    } finally {
        setLoading(refs.signUpButton, false, '新規登録', '登録中...');
    }
}

async function resendConfirmation() {
    const email = refs.authEmail.value.trim();
    if (!email) {
        setAuthStatus('確認メールを再送するにはメールアドレスを入力してください。', 'warning');
        return;
    }

    setLoading(refs.resendConfirmationButton, true, '確認メールを再送', '再送中...');
    try {
        const { error } = await state.supabase.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: window.location.origin
            }
        });

        if (error) {
            throw error;
        }

        setAuthStatus('確認メールの再送をリクエストしました。届かない場合は迷惑メールフォルダと Supabase Auth > Email の設定を確認してください。', 'warning');
        showToast('確認メールを再送しました。', 4200);
    } catch (error) {
        setAuthStatus(error.message || '確認メールの再送に失敗しました。', 'error');
        showToast(error.message || '確認メールの再送に失敗しました。');
    } finally {
        setLoading(refs.resendConfirmationButton, false, '確認メールを再送', '再送中...');
    }
}

async function signOut() {
    const { error } = await state.supabase.auth.signOut();
    if (error) {
        showToast(error.message || 'ログアウトに失敗しました。');
        return;
    }
    showToast('ログアウトしました。');
}

async function refreshAllData() {
    try {
        const [records, readingLogs] = await Promise.all([fetchRecords(), fetchReadingLogs()]);
        state.records = records;
        state.readingLogs = readingLogs;
        updateTitleSuggestions();
        renderAll();
    } catch (error) {
        showToast(error.message || 'データ取得に失敗しました。');
    }
}

async function fetchRecords() {
    const { data, error } = await state.supabase
        .from('manga_records')
        .select(`
            id,
            user_id,
            title,
            title_reading,
            recorded_at,
            quote,
            quote_speaker,
            thoughts,
            tag,
            summary,
            favorite,
            cover_image_path,
            cover_image_url,
            created_at,
            updated_at,
            manga_record_gallery_images (
                id,
                record_id,
                position,
                storage_path,
                public_url,
                created_at
            )
        `)
        .order('recorded_at', { ascending: false });

    if (error) {
        throw error;
    }

    return (data || []).map((record) => ({
        ...record,
        manga_record_gallery_images: [...(record.manga_record_gallery_images || [])].sort((left, right) => left.position - right.position)
    }));
}

async function fetchReadingLogs() {
    const { data, error } = await state.supabase
        .from('reading_logs')
        .select('*')
        .order('reading_date', { ascending: false });

    if (error) {
        throw error;
    }

    return data || [];
}

function updateStats() {
    const favoriteCount = state.records.filter((record) => record.favorite).length;
    const uniqueReadingDays = new Set(state.readingLogs.map((log) => log.reading_date)).size;
    const currentMonthPrefix = toDateInputValue(new Date()).slice(0, 7);
    const monthCount = state.readingLogs.filter((log) => log.reading_date.startsWith(currentMonthPrefix)).length;

    refs.statRecords.textContent = `${state.records.length}`;
    refs.statFavorites.textContent = `${favoriteCount}`;
    refs.statReadingDays.textContent = `${uniqueReadingDays}`;
    refs.statMonthCount.textContent = `${monthCount}`;
}

function renderRecordCard(record) {
    const quote = record.quote?.trim();
    const quoteSpeaker = record.quote_speaker?.trim();
    const quoteText = quote ? `「${escapeHtml(quote)}」${quoteSpeaker ? `-${escapeHtml(quoteSpeaker)}` : ''}` : '';
    const summary = (record.summary || record.thoughts || '').trim();
    const coverHtml = record.cover_image_url
        ? `<img src="${escapeHtml(record.cover_image_url)}" alt="${escapeHtml(record.title)}">`
        : `<div class="record-chip">Cover Free</div>`;

    return `
        <article class="record-card" data-record-id="${escapeHtml(record.id)}">
            <div class="record-card-cover">${coverHtml}</div>
            <div class="record-card-body">
                <div class="record-card-topline">
                    <h4>${escapeHtml(record.title)}</h4>
                    ${record.favorite ? '<span class="record-chip favorite">お気に入り</span>' : ''}
                    ${record.tag ? `<span class="record-chip">${escapeHtml(record.tag)}</span>` : ''}
                </div>
                <div class="record-meta">
                    <span>${escapeHtml(formatDateTime(record.recorded_at))}</span>
                    ${record.title_reading ? `<span>${escapeHtml(record.title_reading)}</span>` : ''}
                </div>
                ${quoteText ? `<div class="record-summary">${quoteText}</div>` : ''}
                ${summary ? `<div class="record-summary">${escapeHtml(summary.slice(0, 140))}${summary.length > 140 ? '…' : ''}</div>` : ''}
                <div class="record-actions">
                    <button type="button" class="tiny-button" data-action="edit-record" data-id="${escapeHtml(record.id)}">編集</button>
                    <button type="button" class="tiny-button" data-action="toggle-favorite" data-id="${escapeHtml(record.id)}">
                        ${record.favorite ? 'お気に入り解除' : 'お気に入り'}
                    </button>
                    <button type="button" class="tiny-button" data-action="delete-record" data-id="${escapeHtml(record.id)}">削除</button>
                </div>
            </div>
        </article>
    `;
}

function renderRecords() {
    const query = normalizeKana(refs.recordSearch.value);
    const filtered = state.records.filter((record) => {
        if (!query) {
            return true;
        }
        return normalizeKana(record.title).startsWith(query) || normalizeKana(record.title_reading).startsWith(query);
    });

    refs.recordsGrid.innerHTML = filtered.length > 0
        ? filtered.map(renderRecordCard).join('')
        : `<div class="empty-state">まだ記録がありません。上のフォームから最初の1冊を登録できます。</div>`;

    const favorites = state.records.filter((record) => record.favorite);
    refs.favoritesGrid.innerHTML = favorites.length > 0
        ? favorites.map(renderRecordCard).join('')
        : `<div class="empty-state">お気に入りはまだありません。気に入った作品を登録したらここに集まります。</div>`;
}

function updateTitleSuggestions() {
    refs.titleSuggestions.innerHTML = uniqueTitles()
        .map((title) => `<option value="${escapeHtml(title)}"></option>`)
        .join('');
}

function renderCoverPreview() {
    const { pendingCoverFile, existingCoverUrl, removeCover } = state.recordEditor;
    if (pendingCoverFile) {
        const src = URL.createObjectURL(pendingCoverFile);
        refs.coverPreview.innerHTML = `<img src="${src}" alt="cover preview">`;
        return;
    }

    if (!removeCover && existingCoverUrl) {
        refs.coverPreview.innerHTML = `<img src="${escapeHtml(existingCoverUrl)}" alt="cover preview">`;
        return;
    }

    refs.coverPreview.textContent = '表紙画像はまだありません';
}

function renderGalleryPreview() {
    const keptExisting = state.recordEditor.existingGallery.filter((item) => !state.recordEditor.removedGalleryIds.has(item.id));
    const existingHtml = keptExisting.map((item) => `
        <div class="gallery-thumb">
            <img src="${escapeHtml(item.public_url)}" alt="gallery image">
            <button type="button" data-action="remove-existing-gallery" data-id="${escapeHtml(item.id)}">×</button>
        </div>
    `);

    const newHtml = state.recordEditor.pendingGalleryFiles.map((file, index) => `
        <div class="gallery-thumb">
            <img src="${escapeHtml(URL.createObjectURL(file))}" alt="gallery preview">
            <button type="button" data-action="remove-new-gallery" data-index="${index}">×</button>
        </div>
    `);

    refs.galleryPreviewGrid.innerHTML = [...existingHtml, ...newHtml].join('') || '<div class="empty-state">ギャラリー画像はまだありません。</div>';
}

function resetRecordForm() {
    refs.recordForm.reset();
    state.recordEditor = createEmptyRecordEditor();
    refs.recordFormHeading.textContent = '新しい感想を保存';
    refs.cancelEditButton.hidden = true;
    refs.recordSubmitButton.textContent = '保存する';
    renderCoverPreview();
    renderGalleryPreview();
}

function populateRecordForm(record) {
    refs.recordTitle.value = record.title || '';
    refs.recordTitleReading.value = record.title_reading || '';
    refs.recordQuote.value = record.quote || '';
    if (refs.recordQuoteSpeaker) {
        refs.recordQuoteSpeaker.value = record.quote_speaker || '';
    }
    refs.recordThoughts.value = record.thoughts || '';
    refs.recordTag.value = record.tag || '';
    refs.recordSummary.value = record.summary || '';
    refs.recordFavorite.checked = Boolean(record.favorite);

    state.recordEditor = {
        editingId: record.id,
        existingCoverPath: record.cover_image_path || '',
        existingCoverUrl: record.cover_image_url || '',
        removeCover: false,
        existingGallery: [...(record.manga_record_gallery_images || [])],
        removedGalleryIds: new Set(),
        pendingCoverFile: null,
        pendingGalleryFiles: []
    };

    refs.recordFormHeading.textContent = `編集: ${record.title}`;
    refs.cancelEditButton.hidden = false;
    refs.recordSubmitButton.textContent = '更新する';
    renderCoverPreview();
    renderGalleryPreview();
    switchTab('create');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function uploadImage(file, folder, recordId) {
    const extension = file.name.includes('.') ? file.name.split('.').pop() : 'png';
    const path = `${state.session.user.id}/${folder}/${recordId}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}.${extension}`;
    const { error } = await state.supabase.storage
        .from(config.storageBucket || 'manga-images')
        .upload(path, file, {
            upsert: false
        });

    if (error) {
        throw error;
    }

    const { data } = state.supabase.storage.from(config.storageBucket || 'manga-images').getPublicUrl(path);
    return {
        storagePath: path,
        publicUrl: data.publicUrl
    };
}

async function removeStorageObjects(paths) {
    const validPaths = paths.filter(Boolean);
    if (validPaths.length === 0) {
        return;
    }

    const { error } = await state.supabase.storage
        .from(config.storageBucket || 'manga-images')
        .remove(validPaths);

    if (error) {
        console.warn('failed to remove storage objects', error);
    }
}

async function saveRecord(event) {
    event.preventDefault();

    const title = refs.recordTitle.value.trim();
    const thoughts = refs.recordThoughts.value.trim();
    if (!title || !thoughts) {
        showToast('タイトルと感想は必須です。');
        return;
    }

    const editingRecord = state.records.find((record) => record.id === state.recordEditor.editingId) || null;
    const recordId = editingRecord?.id || crypto.randomUUID();
    const oldStoragePathsToRemove = [];

    setLoading(refs.recordSubmitButton, true, state.recordEditor.editingId ? '更新する' : '保存する', '保存中...');

    try {
        let coverImagePath = state.recordEditor.existingCoverPath;
        let coverImageUrl = state.recordEditor.existingCoverUrl;

        if (state.recordEditor.removeCover) {
            if (coverImagePath) {
                oldStoragePathsToRemove.push(coverImagePath);
            }
            coverImagePath = '';
            coverImageUrl = '';
        }

        if (state.recordEditor.pendingCoverFile) {
            const uploadedCover = await uploadImage(state.recordEditor.pendingCoverFile, 'covers', recordId);
            if (coverImagePath) {
                oldStoragePathsToRemove.push(coverImagePath);
            }
            coverImagePath = uploadedCover.storagePath;
            coverImageUrl = uploadedCover.publicUrl;
        }

        const keptGallery = state.recordEditor.existingGallery.filter((item) => !state.recordEditor.removedGalleryIds.has(item.id));
        if (keptGallery.length + state.recordEditor.pendingGalleryFiles.length > 3) {
            throw new Error('ギャラリー画像は最大3枚までです。');
        }

        const uploadedGallery = [];
        for (const file of state.recordEditor.pendingGalleryFiles) {
            uploadedGallery.push(await uploadImage(file, 'gallery', recordId));
        }

        const recordPayload = {
            id: recordId,
            user_id: state.session.user.id,
            title,
            title_reading: refs.recordTitleReading.value.trim(),
            recorded_at: editingRecord?.recorded_at || new Date().toISOString(),
            quote: refs.recordQuote.value.trim(),
            quote_speaker: refs.recordQuoteSpeaker ? refs.recordQuoteSpeaker.value.trim() : editingRecord?.quote_speaker || '',
            thoughts,
            tag: refs.recordTag.value.trim(),
            summary: refs.recordSummary.value.trim(),
            favorite: refs.recordFavorite.checked,
            cover_image_path: coverImagePath,
            cover_image_url: coverImageUrl
        };

        if (editingRecord) {
            const { error } = await state.supabase.from('manga_records').update(recordPayload).eq('id', recordId);
            if (error) {
                throw error;
            }
        } else {
            const { error } = await state.supabase.from('manga_records').insert(recordPayload);
            if (error) {
                throw error;
            }
        }

        const finalGallery = [
            ...keptGallery.map((item) => ({
                storage_path: item.storage_path,
                public_url: item.public_url
            })),
            ...uploadedGallery.map((item) => ({
                storage_path: item.storagePath,
                public_url: item.publicUrl
            }))
        ];

        const removedGalleryPaths = state.recordEditor.existingGallery
            .filter((item) => state.recordEditor.removedGalleryIds.has(item.id))
            .map((item) => item.storage_path);

        const { error: deleteGalleryRowsError } = await state.supabase
            .from('manga_record_gallery_images')
            .delete()
            .eq('record_id', recordId);

        if (deleteGalleryRowsError) {
            throw deleteGalleryRowsError;
        }

        if (finalGallery.length > 0) {
            const { error: insertGalleryRowsError } = await state.supabase
                .from('manga_record_gallery_images')
                .insert(
                    finalGallery.map((item, index) => ({
                        record_id: recordId,
                        position: index,
                        storage_path: item.storage_path,
                        public_url: item.public_url
                    }))
                );

            if (insertGalleryRowsError) {
                throw insertGalleryRowsError;
            }
        }

        await removeStorageObjects([...oldStoragePathsToRemove, ...removedGalleryPaths]);
        await refreshAllData();
        resetRecordForm();
        switchTab('records');
        showToast(editingRecord ? '感想を更新しました。' : '感想を保存しました。');
    } catch (error) {
        showToast(error.message || '保存に失敗しました。');
    } finally {
        setLoading(refs.recordSubmitButton, false, state.recordEditor.editingId ? '更新する' : '保存する', '保存中...');
    }
}

async function deleteRecord(recordId) {
    const record = state.records.find((item) => item.id === recordId);
    if (!record) {
        return;
    }

    const confirmed = window.confirm(`「${record.title}」を削除しますか？`);
    if (!confirmed) {
        return;
    }

    const galleryPaths = (record.manga_record_gallery_images || []).map((item) => item.storage_path);

    try {
        const { error } = await state.supabase.from('manga_records').delete().eq('id', recordId);
        if (error) {
            throw error;
        }
        await removeStorageObjects([record.cover_image_path, ...galleryPaths]);
        if (state.recordEditor.editingId === recordId) {
            resetRecordForm();
        }
        await refreshAllData();
        showToast('記録を削除しました。');
    } catch (error) {
        showToast(error.message || '削除に失敗しました。');
    }
}

async function toggleFavorite(recordId) {
    const record = state.records.find((item) => item.id === recordId);
    if (!record) {
        return;
    }

    // Optimistic Update: ローカルstateを即座に更新してUIを反映
    const previousFavorite = record.favorite;
    record.favorite = !previousFavorite;
    updateStats();
    renderRecords();

    // バックグラウンドでサーバーに保存
    const { error } = await state.supabase
        .from('manga_records')
        .update({ favorite: record.favorite })
        .eq('id', recordId);

    if (error) {
        // 失敗時はロールバック
        record.favorite = previousFavorite;
        updateStats();
        renderRecords();
        showToast(error.message || 'お気に入り更新に失敗しました。');
    }
}

function logsForDate(date) {
    return state.readingLogs.filter((log) => log.reading_date === date);
}

function renderDailyLogs() {
    const logs = logsForDate(state.selectedDate);
    refs.selectedLogsHeading.textContent = `${formatSelectedDate(state.selectedDate)} の記録`;
    refs.dailyLogList.innerHTML = logs.length > 0
        ? logs.map((log) => `
            <article class="daily-log-item">
                <h4>${escapeHtml(log.title)}</h4>
                <div class="daily-log-meta">
                    ${escapeHtml(formatVolumeRange(log))}
                </div>
                <div class="daily-log-actions">
                    <button type="button" class="tiny-button" data-action="edit-log" data-id="${escapeHtml(log.id)}">編集</button>
                    <button type="button" class="tiny-button" data-action="delete-log" data-id="${escapeHtml(log.id)}">削除</button>
                </div>
            </article>
        `).join('')
        : `<div class="empty-state">この日はまだ読書ログがありません。右上のフォームから追加できます。</div>`;
}

function renderCalendar() {
    const monthStart = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth(), 1);
    const monthEnd = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 1, 0);
    const startWeekday = monthStart.getDay();
    const totalDays = monthEnd.getDate();
    const entriesByDate = new Map();

    state.readingLogs.forEach((log) => {
        if (!entriesByDate.has(log.reading_date)) {
            entriesByDate.set(log.reading_date, []);
        }
        entriesByDate.get(log.reading_date).push(log);
    });

    refs.calendarMonthLabel.textContent = formatMonthLabel(monthStart);
    refs.calendarSelectedDateLabel.textContent = formatSelectedDate(state.selectedDate);

    const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
    const cells = weekdayLabels.map((label) => `<div class="calendar-weekday">${label}</div>`);

    for (let index = 0; index < startWeekday; index += 1) {
        cells.push('<div class="calendar-cell outside"></div>');
    }

    for (let day = 1; day <= totalDays; day += 1) {
        const date = `${monthStart.getFullYear()}-${`${monthStart.getMonth() + 1}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
        const dayEntries = entriesByDate.get(date) || [];
        const classes = ['calendar-cell'];
        if (date === state.selectedDate) {
            classes.push('selected');
        }

        cells.push(`
            <button type="button" class="${classes.join(' ')}" data-action="select-date" data-date="${date}">
                <strong class="calendar-day">${day}</strong>
                <div class="calendar-entries">
                    ${dayEntries.slice(0, 3).map((entry) => `<div class="calendar-entry-chip">${escapeHtml(entry.title)}<br>${escapeHtml(formatVolumeRange(entry))}</div>`).join('')}
                    ${dayEntries.length === 0 ? '<div class="calendar-cell-note">ログなし</div>' : ''}
                    ${dayEntries.length > 3 ? `<div class="calendar-cell-note">+${dayEntries.length - 3}件</div>` : ''}
                </div>
            </button>
        `);
    }

    refs.calendarGrid.innerHTML = cells.join('');
    renderDailyLogs();
}

function formatVolumeRange(log) {
    const start = (log.volume_start || '').trim();
    const end = (log.volume_end || '').trim();
    if (start && end && start === end) {
        return `${start}巻`;
    }
    if (start && end) {
        return `${start}巻 - ${end}巻`;
    }
    if (start) {
        return `${start}巻`;
    }
    if (end) {
        return `${end}巻`;
    }
    return '巻数未入力';
}

function resetCalendarForm() {
    refs.calendarForm.reset();
    refs.calendarDate.value = state.selectedDate;
    state.calendarEditingId = null;
    refs.calendarFormHeading.textContent = '読書ログを追加';
    refs.cancelLogEditButton.hidden = true;
    refs.calendarSubmitButton.textContent = '保存する';
}

function populateCalendarForm(log) {
    state.selectedDate = log.reading_date;
    state.calendarCursor = new Date(`${log.reading_date}T00:00:00`);
    refs.calendarDate.value = log.reading_date;
    refs.calendarTitle.value = log.title;
    refs.calendarVolumeStart.value = log.volume_start || '';
    refs.calendarVolumeEnd.value = log.volume_end || '';
    state.calendarEditingId = log.id;
    refs.calendarFormHeading.textContent = `編集: ${log.title}`;
    refs.cancelLogEditButton.hidden = false;
    refs.calendarSubmitButton.textContent = '更新する';
}

async function saveReadingLog(event) {
    event.preventDefault();

    const isEditing = Boolean(state.calendarEditingId);
    const payload = {
        id: state.calendarEditingId || crypto.randomUUID(),
        user_id: state.session.user.id,
        reading_date: refs.calendarDate.value,
        title: refs.calendarTitle.value.trim(),
        volume_start: refs.calendarVolumeStart.value.trim(),
        volume_end: refs.calendarVolumeEnd.value.trim()
    };

    if (!payload.reading_date || !payload.title) {
        showToast('日付とタイトルは必須です。');
        return;
    }

    setLoading(refs.calendarSubmitButton, true, state.calendarEditingId ? '更新する' : '保存する', '保存中...');

    try {
        if (state.calendarEditingId) {
            const { error } = await state.supabase.from('reading_logs').update(payload).eq('id', payload.id);
            if (error) {
                throw error;
            }
        } else {
            const { error } = await state.supabase.from('reading_logs').insert(payload);
            if (error) {
                throw error;
            }
        }

        state.selectedDate = payload.reading_date;
        state.calendarCursor = new Date(`${payload.reading_date}T00:00:00`);
        resetCalendarForm();
        await refreshAllData();
        showToast(isEditing ? '読書ログを更新しました。' : '読書ログを保存しました。');
    } catch (error) {
        showToast(error.message || '読書ログの保存に失敗しました。');
    } finally {
        setLoading(refs.calendarSubmitButton, false, state.calendarEditingId ? '更新する' : '保存する', '保存中...');
    }
}

async function deleteReadingLog(logId) {
    const target = state.readingLogs.find((log) => log.id === logId);
    if (!target) {
        return;
    }

    const confirmed = window.confirm(`「${target.title}」の読書ログを削除しますか？`);
    if (!confirmed) {
        return;
    }

    const { error } = await state.supabase.from('reading_logs').delete().eq('id', logId);
    if (error) {
        showToast(error.message || '読書ログ削除に失敗しました。');
        return;
    }

    if (state.calendarEditingId === logId) {
        resetCalendarForm();
    }
    await refreshAllData();
    showToast('読書ログを削除しました。');
}

function renderAll() {
    updateStats();
    renderRecords();
    renderCalendar();
    refs.calendarDate.value = refs.calendarDate.value || state.selectedDate;
}

function bindEvents() {
    refs.signInButton.addEventListener('click', () => {
        void signIn();
    });
    refs.signUpButton.addEventListener('click', () => {
        void signUp();
    });
    refs.resendConfirmationButton.addEventListener('click', () => {
        void resendConfirmation();
    });
    refs.signOutButton.addEventListener('click', () => {
        void signOut();
    });
    refs.refreshButton.addEventListener('click', () => {
        void refreshAllData();
    });

    refs.tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
        });
    });

    refs.recordForm.addEventListener('submit', (event) => {
        void saveRecord(event);
    });
    refs.recordResetButton.addEventListener('click', () => resetRecordForm());
    refs.cancelEditButton.addEventListener('click', () => resetRecordForm());
    refs.recordSearch.addEventListener('input', () => renderRecords());

    refs.recordCoverInput.addEventListener('change', () => {
        const file = refs.recordCoverInput.files?.[0] || null;
        state.recordEditor.pendingCoverFile = file;
        state.recordEditor.removeCover = false;
        renderCoverPreview();
    });

    refs.recordGalleryInput.addEventListener('change', () => {
        const files = Array.from(refs.recordGalleryInput.files || []);
        state.recordEditor.pendingGalleryFiles = [
            ...state.recordEditor.pendingGalleryFiles,
            ...files
        ].slice(0, 3);
        refs.recordGalleryInput.value = '';
        renderGalleryPreview();
    });

    refs.removeCoverButton.addEventListener('click', () => {
        state.recordEditor.pendingCoverFile = null;
        state.recordEditor.removeCover = true;
        renderCoverPreview();
    });

    refs.recordsGrid.addEventListener('click', handleRecordGridClick);
    refs.favoritesGrid.addEventListener('click', handleRecordGridClick);
    refs.galleryPreviewGrid.addEventListener('click', handleGalleryPreviewClick);

    refs.calendarPrevButton.addEventListener('click', () => {
        state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() - 1, 1);
        renderCalendar();
    });
    refs.calendarTodayButton.addEventListener('click', () => {
        state.calendarCursor = new Date();
        state.selectedDate = toDateInputValue(new Date());
        refs.calendarDate.value = state.selectedDate;
        renderCalendar();
    });
    refs.calendarNextButton.addEventListener('click', () => {
        state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 1, 1);
        renderCalendar();
    });

    refs.calendarGrid.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-action="select-date"]');
        if (!trigger) {
            return;
        }
        state.selectedDate = trigger.dataset.date;
        refs.calendarDate.value = state.selectedDate;
        renderCalendar();
    });

    refs.calendarForm.addEventListener('submit', (event) => {
        void saveReadingLog(event);
    });
    refs.calendarResetButton.addEventListener('click', () => resetCalendarForm());
    refs.cancelLogEditButton.addEventListener('click', () => resetCalendarForm());
    refs.dailyLogList.addEventListener('click', handleDailyLogClick);
}

function handleRecordGridClick(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) {
        return;
    }

    const record = state.records.find((item) => item.id === trigger.dataset.id);
    if (!record) {
        return;
    }

    const action = trigger.dataset.action;
    if (action === 'edit-record') {
        populateRecordForm(record);
        return;
    }
    if (action === 'toggle-favorite') {
        void toggleFavorite(record.id);
        return;
    }
    if (action === 'delete-record') {
        void deleteRecord(record.id);
    }
}

function handleGalleryPreviewClick(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) {
        return;
    }

    if (trigger.dataset.action === 'remove-existing-gallery') {
        state.recordEditor.removedGalleryIds.add(trigger.dataset.id);
        renderGalleryPreview();
        return;
    }

    if (trigger.dataset.action === 'remove-new-gallery') {
        const index = Number(trigger.dataset.index);
        state.recordEditor.pendingGalleryFiles.splice(index, 1);
        renderGalleryPreview();
    }
}

function handleDailyLogClick(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) {
        return;
    }

    const log = state.readingLogs.find((item) => item.id === trigger.dataset.id);
    if (!log) {
        return;
    }

    if (trigger.dataset.action === 'edit-log') {
        populateCalendarForm(log);
        switchTab('calendar');
        return;
    }

    if (trigger.dataset.action === 'delete-log') {
        void deleteReadingLog(log.id);
    }
}

function bootstrap() {
    bindEvents();
    resetRecordForm();
    resetCalendarForm();
    renderAll();
    void initializeSupabase();
}

bootstrap();
